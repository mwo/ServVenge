const WebSocket = require('ws'),
    msgpack = require('msgpack-lite');

const Ac = require('./ac.js');

require('colors');

class Serv {
    constructor() {
        this.wss;

        this.adminPass = "myBrainIsFat";

        this.count = 0;

        this.defualt = {
            weapon: 'Scar',
            bonus: 0,
            capture: 0,
            rank: 0,
            revenge: 0,
            totalCardPoint: 0,
            reward: 0,
            damage: 0,
            assist: 0,
            headshot: 0,
            kill: 0,
            death: 0,
            score: 0,
            bar: 0,
            tier: 1,
            health: 100,
            streak: 0,
            inPoint: !1,
            lastPos: []
        }

        var def = this.defualt;

        this.map = Math.random() * 2 | 0 ? "Sierra" : "Xibalba";
        this.objective = 0;
        this.votes = {
            Sierra: 0,
            Xibalba: 0
        };

        //beginning matchmaker ws shit
        this.rMap = {
            auth: (ws, emit, msg) => {
                ws.send('room', this.players.list, 3, false, false, true)
                setTimeout(()=>{
                    ws.send('start')
                    setTimeout(()=> ws.close(),100)
                },100)
            },
            matchmaker: (ws, emit, msg) => {
                ws.send('nerd')
            }
        }

        this.eMap = {
            auth: (ws, emit, msg) => {
                this.count++;
                let id = this.count,
                    name = (msg[2] == "none" ? "Guest " + id : msg[2]).slice(0, 100).replace(/\[ || \]/g, '');

                    
                ws.id = id;

                console.log('Connected '.green + '->', ws.id, name);

                if (!this.players.list.includes(name)) this.players.list.push(name);

                this.players[name] = {
                    playerId: id,
                    verified: true,
                    id: id,
                    username: name,
                    team: "none",
                    skin: msg[3],
                    group: id,
                    ...def
                }

                new Ac(ws, this.players[name], (w, reason)=> {
                    console.log('Detection ->', w.id, reason);
                }, console.log)

                ws.send('me', this.players[name]);
                this.players.list.forEach(e => ws.send('player', this.players[e]));
                emit('player', this.players[name]);
                ws.send("mode", "POINT", this.map);

            },
            character: (ws, emit, msg) => {
                ws.send("character", ...msg.slice(1));
            },
            respawn: (ws, emit, msg) => {
                ws.send("h", ws.id, 100);
                let plr = this.getPlayer(ws.id);
                if (plr) plr.health = 100;
                emit("respawn", ws.id)
            },
            weapon: (ws, emit, msg) => {
                emit('weapon', ws.id, ...msg.slice(1));
            },
            point: (ws, _, msg, emit) => {
                this.getObPoint(ws, 2)
            },
            chat: (ws, _, msg, emit) => {
                let info = [...msg.slice(1).map(e => e + [])][0];

                let clog = m => ws.send("chat", 'console', m);

                if (info[0] == "/") {
                    let map = {
                        admin: (ws, args, emit) => {
                            let pass = args.slice(1).join(' ');
                            ws.admin = ws.admin || pass == this.adminPass;
                            ws.admin ? clog('You are now a admin') : clog('Wrong password');
                        },
                        flip: (ws, args, emit) => {
                            let l = Math.random() * 2 | 0 ? "Heads" : "Tails";
                            clog("You fliped " + l);
                        },
                        nick: (w, args, emit) => {
                            let player = this.getPlayer(w.id);
                            player.username = args[1];
                        },
                        kill: (w, args, emit) => {
                            if (w.admin) {
                                let player = this.players[this.players.list.find(e => e.includes(args[1]))];
                                if (player) {
                                    this.damage(w.id, player.playerId, 100, true, emit)
                                } else {
                                    clog("Player does not exist");
                                }
                            } else {
                                clog('You do not have permission to use this command.')
                            }
                        },
                        kick: (w, args, emit) => {
                            if (w.admin) {
                                let player = this.players[this.players.list.find(e => e.includes(args[1]))];
                                if (player && player.playerId != 1) {
                                    let pws = this.getWs(player.playerId);
                                    pws.send('info', 'You were kicked for: ' + args.slice(2).join(' '));
                                    pws.close();
                                } else {
                                    clog("Player does not exist");
                                }
                            } else {
                                clog('You do not have permission to use this command.')
                            }
                        },
                        points: (w, args, emit) => {
                            if (w.admin) {
                                this.getObPoint(w, +args[1]);
                            } else {
                                clog('You do not have permission to use this command.')
                            }
                        },
                        time: (w, args, emit) => {
                            if (w.admin) {
                                this.time = +args[1]
                            } else {
                                clog('You do not have permission to use this command.')
                            }
                        }
                    }

                    let args = info.slice(1).split(' ');
                    //console.log(args);
                    let fnc = map[args[0]];
                    if (fnc) {
                        fnc(ws, args, emit)
                    } else {
                        clog("Command does not exist.")
                    }
                } else {
                    let c = info.slice(0, 100).replace(/\[ || \]/g, '');
                    if (/[a-zA-Z0-9]+/.test(c)) emit("chat", ws.id, c);
                }

            },
            show: (ws, emit, msg) => {
                emit('show', ws.id, ...msg.slice(1));
            },
            hide: (ws, emit, msg) => {
                emit('hide', ws.id, ...msg.slice(1));
            },
            throw: (ws, emit, msg) => {
                emit(...msg, ws.id, false);
            },
            hurt: (ws, _, msg, emit) => {
                this.damage(msg.pop(), ws.id, 100, true, emit)
            },
            radius: (ws, _, msg, emit) => {

                let rad = 60,
                    thower = ws.id,
                    info = [...msg.slice(1)],
                    pos = {
                        x: info[2] / 5,
                        y: info[3] / 5,
                        z: info[4] / 5
                    };

                this.getPList().forEach(player => {
                    let lp = [...player.lastPos],
                        pPos = {
                            x: lp[0] / 5,
                            y: lp[1] / 5,
                            z: lp[2] / 5
                        },     //this.getD3D(pos.x, pos.y, pos.z, pPos.x, pPos.y, pPos.z);
                        dist = this.getDist(pos.x, pos.z, pPos.x, pPos.z); //fixed ???

                    //console.log(dist)
                    if (dist <= rad) {
                        this.damage(thower, player.playerId, 100, !1, emit);
                        //emit("chat", player.playerId, "bruh")
                    }
                })
            },
            da: (ws, _, msg, emit) => {
                this.damagePacket(ws, msg, emit)
            },
            p: (ws, emit, msg) => {
                let info = [...msg.slice(1)],
                    author = this.getPlayer(ws.id);
                if (author) {
                    author.lastPos = info.slice(0, 3);
                }
                emit('p', ws.id, ...info);
            },
            e: (ws, emit, msg) => {
                emit('e', ws.id, ...msg.slice(1));
            },
            s: (ws, emit, msg) => {
                emit('s', ws.id, ...msg.slice(1));
            },
            vote: (ws, emit, msg) => {
                let prop = this.votes[msg[0]]
                if (prop) prop++;
            },
            guard: (ws, emit, msg) => {
                if (!msg[1]) {
                    ws.send('info', 'You were kicked for: ' + "Cheating");
                    ws.close()
                }
            },
            token: (ws) => {
                ws.send('auth', true);
            }
        }

        this.players = {
            list: []
        };

        this.maxTime = 300;
        this.time = this.maxTime;
    }

    getD3D(a, b, c, d, e, f) {
        let g = a - d,
            h = b - e,
            i = c - f;
        return Math.sqrt(g * g + h * h + i * i);
    }

    getDist(a, b, c, d) {
        return Math.sqrt(Math.abs(a - c) ** 2 + Math.abs(b - d) ** 2)
    }

    getPList() {
        return this.players.list.map(e => this.players[e]).filter(Boolean);
    }

    getPlayer(id) {
        return this.getPList().find(e => e.playerId == id)
    }

    replace(arr, key, rep) {
        return JSON.parse(JSON.stringify(arr).replace(key, rep))
    }

    getObPoint(ws, am) {
        ws.send('point', am);
        let author = this.getPlayer(ws.id);
        if (author) {
            author.inPoint = !0;
            author.score += am;
            author.totalCardPoint += am;
        }
    }

    getWs(id) {
        let ws;
        this.wss.clients.forEach(e => {
            if (e.id == id) ws = e;
        })
        return ws;
    }

    damage(attacker, attacked, damage, headshot, emit) {
        let pckt = ['d', attacked, damage, headshot]
        this.damagePacket({
            id: attacker
        }, pckt, emit)
    }

    damagePacket(ws, msg, emit) {
        let info = [...msg.slice(1)],
            iOb = {
                damage: info[1],
                killer: ws.id,
                killed: info[0],
                reason: 'big gay' //light hearted ;)
            },
            dPlayer = this.getPlayer(iOb.killed),
            kPlayer = this.getPlayer(iOb.killer);

        //checks
        if (!dPlayer) return;
        if (!kPlayer) return;


        //before damage
        if (dPlayer.health <= 0) return;

        dPlayer.health -= iOb.damage;
        emit('h', iOb.killed, dPlayer.health);

        //save stats
        kPlayer.damage += iOb.damage;
        if (info[2]) kPlayer.headshot++;

        //after damage
        if (dPlayer.health <= 0) {

            //streaks
            dPlayer.streak = 0;
            kPlayer.streak++;
            let gain = this.getSScore(kPlayer.streak) + (info[2] ? 10 : 0),
                type = this.getStreak(kPlayer.streak, info[2])

            //lb
            kPlayer.score += gain;
            kPlayer.kill++;
            dPlayer.death++;

            emit('d', iOb.killed);
            emit('k', iOb.killed, iOb.killer);
            emit("announce", "kill", iOb.killer, gain, type)
            emit('notification', 'kill', iOb);

            setTimeout(() => {
                dPlayer.health = 100;
                emit('h', iOb.killed, dPlayer.health)
                emit("respawn", iOb.killed)
            }, 4e3)
        }
    }

    getSScore(streak) {
        return [10, 15, 30, 35, 70, 125, 135, 155, 215, 265][Math.min(streak, 10) - 1]
    }

    getStreak(streak, hs) {
        if (streak == 1) {
            return hs ? "Headshot" : "Kill"
        } else {
            let s = Math.min(streak, 10);
            return s + 'x';
        }
    }

    localLoop(ws) {
        setInterval(() => {
            let player = this.getPlayer(ws.id);
            if (player) player.inPoint = false;
        }, 1e3)
    }

    startGame(emit) {
        setInterval(() => {
            //time
            if (this.time == this.maxTime) {
                emit('start');
            }

            if (!(this.time % 30)) {
                let iPoints = this.getPList().filter(e => e.inPoint).forEach(player => {
                    let aScore = 30;
                    player.score += aScore;
                    player.totalCardPoint += aScore;
                    emit("announce", "objective", player.id, aScore, "Capture")
                })

                emit("objective", this.objective)
                this.objective++
                if (this.objective > 4) this.objective = 0;
            }

            if (this.time > -1) {
                let funny = 817;
                emit('t', this.time);
                this.time--;
            }

            if (this.time == 0) {
                let end = this.getPList().sort((a, b) => b.kill - a.kill);

                emit('finish', end);

                setTimeout(() => {
                    //reset stats

                    //stats obj
                    let rObj = {
                        bonus: 0,
                        capture: 0,
                        rank: 0,
                        revenge: 0,
                        totalCardPoint: 0,
                        reward: 0,
                        damage: 0,
                        assist: 0,
                        headshot: 0,
                        kill: 0,
                        death: 0,
                        score: 0,
                        bar: 0,
                        tier: 1,
                        health: 100,
                        streak: 0
                    }

                    //set the keys
                    this.getPList().forEach(player => {
                        Object.keys(rObj).forEach(e => {
                            player[e] = rObj[e];
                        })
                    })

                    //this.map = (this.votes.Sierra > this.votes.Xibalba ? "Sierra" : "Xibalba");
                    this.map = Math.random() * 2 | 0 ? "Sierra" : "Xibalba";
                    emit('votes', this.votes)
                    emit("mode", "POINT", this.map)

                    this.votes = {
                        Sierra: 0,
                        Xibalba: 0
                    };
                    this.time = this.maxTime;
                }, 15e3)
            }

            //board
            let players = this.getPList();
            let board = players.map(pObj => {
                let bar = (1 / (50 / (pObj.score % 50)))
                pObj.bar = bar == -Infinity ? 1 : bar;
                pObj.tier = (pObj.score / 50 | 0) + 1;

                return {
                    bar: pObj.bar,
                    death: pObj.death,
                    kill: pObj.kill,
                    playerId: pObj.playerId,
                    score: pObj.score,
                    tier: Math.min(pObj.tier, 3),
                    username: pObj.username
                }
            })
            emit('board', board);
        }, 1e3)
    }

    init() {
        this.wss = new WebSocket.Server({
            port: process.env.PORT
        });

        let bcAll = (...data) => {
            this.wss.clients.forEach((client) => {
                if (!client.isMatchmaker && client.readyState === WebSocket.OPEN) {
                    client.send(...data);
                }
            });
        }

        console.log('init')
        this.startGame(bcAll);

        this.wss.on('connection', (ws, req) => {
            ws.id = null;
            ws.admin = false;

            let isMatchmaker = req.url.includes('true');
            ws.isMatchmaker = isMatchmaker;

            let broadCast = (...data) => {
                this.wss.clients.forEach((client) => {
                    if (!client.isMatchmaker && client.id !== ws.id && client.readyState === WebSocket.OPEN) {
                        client.send(...data);
                    }
                });
            }

            this.localLoop(ws);

            ws.s = ws.send;
            ws.send = (...args) => {
                //console.log(args)
                return ws.s(msgpack.encode(args))
            }

            ws.on('close', () => {
                let player = this.getPlayer(ws.id);
                
                if (player) {
                    let name = player.username;
                    broadCast('left', ws.id);
                    console.log('Left '.red + '->', ws.id, name)
                    delete this.players[name];
                }
            })

            ws.send(isMatchmaker ? 'auth' : 'token', true);
            ws.on('message', (_, msg = msgpack.decode(_)) => {
                if (typeof msg[0] != 'string') return;
                let f = (isMatchmaker ? this.rMap : this.eMap)[msg[0]];
                if (f) {
                    f(ws, broadCast, msg, bcAll);
                } else {
                    console.log('new ->', msg[0], msg)
                }
            });
        });
    }
}


let sv = new Serv();
sv.init();
server.listen(443);