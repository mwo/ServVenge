const WebSocket = require('ws'),
    msgpack = require('msgpack-lite');

let getType = t => t.constructor.name.toLowerCase();
Array.prototype.check = function (...types) {
    return this.map(getType).every((e, i) => e == types[i]) && this.length == types.length;
}
Array.prototype.un = function () {
    return this.map(e => e / 5);
}
Array.prototype.vector = function () {
    return {
        x: this[0],
        y: this[1],
        z: this[2]
    };
}

class ssac {
    constructor(ws, plr, callback, debug) {
        //onsend aka incoming
        let send = ws.send;
        ws.send = (...args) => {
            this.onsend(args);
            return send.apply(this, args)
        }

        //constructor
        this.ws = ws;
        this.callback = callback;
        this.log = debug;
        this.immune = true; //for position stuff

        //actual player object from constructor
        this.plr = plr;

        //damages
        this.damages = {
            Sniper: {
                body: 95
            },
            Scar: {
                body: 15
            }
        }

        //information tracking on player
        this.player = {
            inAir: [], //used an array as a defualt value because they cannot be compared ex: [] == [] -> false
            isEmote: [],
            dashed: [],
            s: {
                w: !1,
                a: !1,
                s: !1,
                d: !1,
                f: !1
            },
            speed: 0,
            lastp: null,
            e: ''
        }

        this.speedLimit = 3.5; // speed cap

        this.mMap = {

            //set up parsing for inputs and validate position.
            p: msg => {
                //type check
                this.check(msg, 'string', 'number', 'number', 'number', 'number', 'number')

                //get player positions
                let p = this.player,
                    pos = msg.slice(1).slice(0, 3).un(), //extract and decode positions
                    vec = pos.vector();

                //make sure we have a last position to compare to
                if (!p.lastP) return;

                //player var and distance
                let lp = p.lastP.vector(),
                    dist = this.getDist(lp.x, lp.z, vec.x, vec.z);

                //save speed to player obj
                p.speed = dist;

                //check if immune or over speed limit
                if (!this.immune && p.speed >= this.speedLimit) this.isc(msg[0]);

                //save position
                p.lastP = pos;
            },
            throw: msg => {
                //type check
                this.check(msg, 'string', 'string', 'number', 'number', 'number', 'number', 'number', 'number')
            },
            s: msg => {
                //type check
                this.check(msg, 'string', 'string', 'boolean');

                //keeping in order
                let cur = this.player.s;
                cur[msg[1]] = !cur[msg[1]];
                if (cur[msg[1]] != msg[2]) this.isc(msg[0]);
            },
            da: msg => {
                //type check
                this.check(msg, 'string', 'number', 'number', 'boolean', 'number', 'number', 'number');

                //cant fire unless animation is playing
                if (!this.player.s.f) this.isc(msg[0]);


                //generate server side damage and compare note: (this should be server side anyway)
                //vars
                let dmg = msg[2],
                    weapon = this.damages[this.plr.weapon];

                //make sure weapon is in damages obj
                if (!weapon) return;

                let sdmg = weapon.body + (msg[3] ? 5 : 0); //calculate damage

                //comparing
                if (dmg != sdmg) this.isc('Manipulated damage value');

            },
            point: msg => {
                //type check
                this.check(msg, 'string');
            },
            guard: msg => {
                //type check
                this.check(msg, 'string', 'boolean');
            },
            show: msg => {
                //type check
                this.check(msg, 'string', 'boolean');
            },
            chat: msg => {
                //type check
                this.check(msg, 'string', 'string');
            },
            e: msg => {
                //type check
                this.check(msg, 'string', 'string');

                //vars
                let p = this.player,
                    k = msg[1],
                    brh = () => this.isc(msg.slice(0, 2).join(' '));

                if (k == 'connected') return; //doesn't trigger speed detect on spawn
                //cant jump more than twice ???? without landing
                if (p.e.includes('jjj')) brh();

                (p.e += k).slice(0, 3);
            },
            weapon: msg => {
                //type check
                this.check(msg, 'string', 'string');
            },
            vote: msg => {
                //type check
                this.check(msg, 'string', 'string');

                //value check
                let prop = msg[1];
                if (prop != "Sierra" || prop != "Xibalba") this.isc(msg[0]);
            }
        }

        //onmessage aka outgoing
        ws.on('message', this.message.bind(this));
    }

    sComp(a, b) {
        return a == b && getType(a) == getType(b);
    }

    getDist(a, b, c, d) {
        return Math.sqrt(Math.abs(a - c) ** 2 + Math.abs(b - d) ** 2);
    }

    check(msg, ...args) {
        if (!msg.check(...args)) this.isc('type error');
    }

    isc(reason) {
        this.callback(this.ws, reason, this.speed);
    }

    message(_, msg = msgpack.decode(_)) {
        let f = this.mMap[msg[0]];
        if (f) f(msg);
    }

    onsend(msg) {
        if (msg[0] == 'respawn' && msg[1] == this.plr.playerId) {
            this.immune = true;
            setTimeout(() => this.immune = false, 2e3);
        }
    }

}

module.exports = ssac;