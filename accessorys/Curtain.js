let {
    AccessoryConfig,
    Logger,
    API,
    CharacteristicSetCallback,
    CharacteristicGetCallback,
    CharacteristicValue,
    Characteristic,
    Service, HAPStatus
} = require("homebridge");
const Accessory = require("../Accessory");
const i2c = require("i2c-bus");
const VL53L0X = require("vl53l0x");
const Gpio = require("../index")("pigpio").Gpio;
const Switcher = require("../index")("switcher");
const fs = require("fs");

module.exports.clazz = class Curtain extends Accessory {

    position = 0;
    state = 2;
    target = 0;

    /**
     * @param {Logger} log
     * @param {AccessoryConfig} config
     * @param {API} api
     */
    constructor(log, config, api) {
        super(log);
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;

        this.name = config["name"];
        this.serial = config["serial"] || "12341234";
        this.clickTime = config["clickTime"] || 100;
        this.sensorAddress = (config["sensor"] || {})["address"] || 0x29;
        this.sensorUpdateOffset = (config["sensor"] || {})["updateOffset"] || 10;
        this.curtainSelectIndex = ((config["control"] || {})["select"] || {})["index"] || 1;
        this.selectUpButton = new Gpio(((config["control"] || {})["select"] || {})["up"] || 21, {mode: Gpio.INPUT});
        this.stopButton = new Gpio((config["control"] || {})["stop"] || 2, {mode: Gpio.INPUT});
        this.upButton = new Gpio((config["control"] || {})["up"] || 3, {mode: Gpio.INPUT});
        this.downButton = new Gpio((config["control"] || {})["down"] || 4, {mode: Gpio.INPUT});
        this.maxDistance = config["calibration"]["maxDistance"];
        this.maxTime = config["calibration"]["maxTime"];
        this.maxTimeDark = config["calibration"]["maxTimeDark"];
        this.targetTolerance = config["calibration"]["targetTolerance"];

        Switcher.setButton(this.selectUpButton, this.clickTime);

        fs.readFile("save-" + this.name + ".json", (err, data) => {
            if (!err) {
                data = JSON.parse(data);
                if (data.position) {
                    this.position = data.position;
                }
                if (data.target) {
                    this.target = data.target;
                }
            }
        });

        /*

        i2c.openPromisified(3, {forceAccess: true}).then(async bus => {
            const laser = VL53L0X(bus, this.sensorAddress);
            await laser.setSignalRateLimit(0.1);
            await laser.setVcselPulsePeriod("pre", 18);
            await laser.setVcselPulsePeriod("final", 14);
            await laser.setMeasurementTimingBudget(200000);

            let lastDistance = undefined;

            setInterval(async () => {
                const distance = await laser.measure();
                if (!lastDistance || Math.abs(lastDistance - distance) > this.sensorUpdateOffset) {
                    lastDistance = distance;
                    this.updatePosition(distance);
                }
            }, 1000);
        });

        */

        this.registerServices();
    }

    registerServices() {
        let informationService = new Service.AccessoryInformation();
        informationService.setCharacteristic(Characteristic.SerialNumber, this.serial);
        this.services.push(informationService);

        this.curtainService = new Service.WindowCovering(this.name);
        this.registerCharacteristic(this.curtainService, Characteristic.CurrentPosition, this.getPosition);
        this.registerCharacteristic(this.curtainService, Characteristic.PositionState, this.getState);
        this.registerCharacteristic(this.curtainService, Characteristic.TargetPosition, this.getTarget, this.setTarget);
        this.services.push(this.curtainService);
    }

    /**
     * @param {CharacteristicGetCallback} next
     */
    getPosition(next) {
        next(HAPStatus.SUCCESS, this.position);
    }

    /**
     * @param {CharacteristicGetCallback} next
     */
    getState(next) {
        next(HAPStatus.SUCCESS, this.state);
    }

    /**
     * @param {CharacteristicGetCallback} next
     */
    getTarget(next) {
        next(HAPStatus.SUCCESS, this.target);
    }

    /**
     * @param {CharacteristicValue} value
     * @param {CharacteristicSetCallback} next
     */
    setTarget(value, next) {
        this.target = value;
        this.checkState();
        next(HAPStatus.SUCCESS, this.target);
    }

    updatePosition(value) {
        this.position = Math.max(0, Math.min(value, this.maxDistance)) / this.maxDistance * -100 + 100;
        this.checkState();
        this.curtainService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.position);
    }

    async pushButton(pin) {
        const sleep = s => new Promise(r => setTimeout(r, s));

        await Switcher.changeIndex(this.curtainSelectIndex);

        await sleep(200);
        pin.mode(Gpio.OUTPUT);
        await sleep(this.clickTime);
        pin.mode(Gpio.INPUT);
    }

    async checkState() {
        const update = () => {
            this.curtainService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.position);
            this.curtainService.getCharacteristic(Characteristic.PositionState).updateValue(this.state);

            fs.writeFile("save-" + this.name + ".json", JSON.stringify({
                target: this.target,
                position: this.position
            }), () => null);
        }

        await Switcher.lockState();

        if (this.target === 0) {
            this.state = 0;
            await this.pushButton(this.downButton);
            Switcher.freeState();
            setTimeout(() => {
                this.position = 0;
                this.state = 2;
                update();
            }, this.maxTimeDark * 1000);
        } else if (this.target === 100) {
            this.state = 1;
            await this.pushButton(this.upButton);
            Switcher.freeState();
            setTimeout(() => {
                this.position = 100;
                this.state = 2;
                update();
            }, this.maxTimeDark * 1000);
        } else {
            const dif = this.position - this.target;
            let time = this.maxTime * (Math.abs(dif) / 100);

            if (this.position === 0) {
                time += this.maxTimeDark - this.maxTime;
            }

            if (dif < 0) {
                this.state = 1;
                await this.pushButton(this.upButton);
            } else {
                this.state = 0;
                await this.pushButton(this.downButton);
            }

            setTimeout(async () => {
                this.position = this.target;
                this.state = 2;
                await this.pushButton(this.stopButton);
                Switcher.freeState();
                update();
            }, time * 1000);
        }
        update();

        /*
        if (Math.abs(dif) <= this.targetTolerance) {
            if (this.state !== 2) {
                this.state = 2;
                this.pushButton(this.stopButton);
            }
        } else {
            if (dif < 0) {
				if (this.state !== 1) {
					this.state = 1;
                    this.pushButton(this.upButton);
                }
            } else {
                if (this.state !== 0) {
                    this.state = 0;
                    this.pushButton(this.downButton);
                }
            }
        }

        this.curtainService.getCharacteristic(Characteristic.PositionState).updateValue(this.state);
        */
    }
}