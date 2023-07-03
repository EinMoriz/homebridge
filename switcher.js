const {Gpio} = require("./index")("pigpio");

class Switcher {

    currentIndex = 0;

    setButton(up, down, clickTime) {
        this.up = up;
        this.clickTime = clickTime;
    }

    async changeIndex(index) {
        const sleep = s => new Promise(r => setTimeout(r, s));

        while (this.currentIndex !== index) {
            this.up.mode(Gpio.INPUT);
            await sleep(this.clickTime);
            this.up.mode(Gpio.OUTPUT);
            await sleep(this.clickTime);
            this.up.mode(Gpio.INPUT);
            await sleep(1000);

            this.currentIndex++;
            if (this.currentIndex === 11) {
                this.currentIndex = 1;
            }
        }
    }
}

module.exports = Switcher;