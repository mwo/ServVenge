const express = require('express'),
    app = express(),
    server = require('http').Server(app);

//const Ac = require('./ac.js');

require('colors');

const Serv = require('./srvmain.js')


let sv = new Serv(server);
sv.init();
server.listen(process.env.PORT || 443);