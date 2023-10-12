const fs = require("fs");

let Gpio;

const sleep = s => new Promise(r => setTimeout(r, s));

class Switcher {

    currentIndex;
    currentWorkerId = 0;
    nextWorkerId = 0;
    isChanging = false;

    constructor(pigpio) {
        Gpio = pigpio.Gpio;

        this.currentIndex = parseInt(fs.readFileSync("currentIndex", {encoding: "utf8"}));
    }

    setButton(up, clickTime) {
        this.up = up;
        this.up.mode(Gpio.INPUT);
    }

    async lockState() {
        const workerId = this.nextWorkerId++;

        console.log("Wait Switcher id:", workerId);

        while (this.currentWorkerId !== workerId) {
            await sleep(500);
        }

        console.log("Lock Switcher");
    }

    freeState() {
        this.currentWorkerId++;
        console.log("Free Switcher next:", this.currentWorkerId);
    }

    async changeIndex(index) {
        while (this.isChanging) {
            await sleep(500);
        }

        this.isChanging = true;
        console.log("start", this.currentIndex, index);

        while (this.currentIndex !== index) {
            this.up.mode(Gpio.OUTPUT);
            await sleep(600);
            this.up.mode(Gpio.INPUT);

            this.currentIndex++;
            if (this.currentIndex === 11) {
                this.currentIndex = 1;
            }

            if (this.currentIndex !== index) {
                await sleep(900);
            }

            console.log(this.currentIndex, index);

            await fs.writeFileSync("currentIndex", "" + this.currentIndex)
        }

        this.isChanging = false;
        console.log("finished", this.currentIndex);
    }
}

module.exports = Switcher;