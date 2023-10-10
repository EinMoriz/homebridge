const fs = require("fs");

let Gpio;

class Switcher {

    constructor(pigpio) {
       Gpio = pigpio.Gpio;

       this.currentIndex = parseInt(fs.readFileSync("currentIndex", {encoding: "utf8"}));
    }

    currentIndex;

    setButton(up, clickTime) {
        this.up = up;
    }

    async changeIndex(index) {
        const sleep = s => new Promise(r => setTimeout(r, s));

        while (this.currentIndex !== index) {
            this.up.mode(Gpio.INPUT);
            await sleep(500);
            this.up.mode(Gpio.OUTPUT);
            await sleep(500);
            this.up.mode(Gpio.INPUT);
            await sleep(1000);

            console.log(this.currentIndex, index);

            this.currentIndex++;
            if (this.currentIndex === 11) {
                this.currentIndex = 1;
            }

            await fs.writeFileSync("currentIndex", ""+this.currentIndex)
        }
    }
}

module.exports = Switcher;