/**
 * Module dependencies.
 */

var express = require('express');
var path = require('path');
var expressValidator = require('express-validator');
var uuid = require('uuid');

/**
 * Load controllers.
 */

var homeController = require('./controllers/home');

/**
 * List of random names
 */
var randomNames = require('./config/names');

/**
 * Create Express server & Socket.IO
 */

var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require('socket.io').listen(server);

/**
 * Express configuration.
 */

var hour = 3600000;
var day = (hour * 24);
var week = (day * 7);
var month = (day * 30);

app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(require('connect-assets')({
	src: 'public',
	helperContext: app.locals
}));
app.use(express.compress());
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.cookieParser());
app.use(express.json());
app.use(express.urlencoded());
app.use(expressValidator());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: week }));
app.use(function(req, res) {
	res.status(404);
	res.render('404');
});
app.use(express.errorHandler());

/**
 * Application routes.
 */

app.get('/', homeController.index);
app.get('/room/:room', homeController.room);

/**
 * Start Express server.
 */

server.listen(app.get('port'), function() {
	console.log("✔ Express server listening on port %d in %s mode", app.get('port'), app.settings.env);
});

/**
* Socket.IO
* ________________________
*/

io.configure(function() {
	io.enable('browser client minification');  // send minified client
	io.enable('browser client etag');          // apply etag caching logic based on version number
	io.enable('browser client gzip');          // gzip the file
	io.set('log level', 1);                    // reduce logging
	io.set('transports', [                     // enable all transports (optional if you want flashsocket)
			'websocket'
		, 'flashsocket'
		, 'htmlfile'
		, 'xhr-polling'
		, 'jsonp-polling'
	]);
});

var people = {};
var rooms = {};
var currentUserStory = undefined;

io.sockets.on('connection', function(socket) {
	// We stock socket's id in the people array with "user" as it's name
	people[socket.id] = {"name" : randomNames.names[Math.floor(Math.random() * 49) + 1].name};


	/**
	 * Newly connected client
	 */
	//console.log(socket.id+' : Socket connected');
	socket.on('room',function(room){
		var peopleInRoom = {};

		// Join room
		socket.join(room);
 
 		// Show for each room who is online in it
		io.sockets.clients(room).forEach(function (socket) { 
			peopleInRoom[socket.id] = {'name' : people[socket.id].name};
		});


		// Send the list of participants to newly connected socket
		socket.emit('participants', {people: peopleInRoom, id: socket.id});
		// Send the current User Story if one is already here
		if (currentUserStory != undefined) {
		 	socket.emit('newUserStory', currentUserStory);
		}
		// Then broadcast the array in order to list all participants in main.js
		socket.broadcast.to(room).emit('participants', {people: peopleInRoom, connect: peopleInRoom[socket.id].name});
	});


	/**
	 * Client changes his name
	 */
	 socket.on('newName',function(data){
	 	console.log(data.room);
	 	people[socket.id].name = data.newName; 
	 	io.sockets.in(data.room).emit('participants', {people: people});
	 });

	/**
	 * Client chooses his card
	 */
	 socket.on('cardSelected',function(data){
	 	var peopleInRoom = {};

	 	people[socket.id].card = data.card;

		io.sockets.clients(data.room).forEach(function (socket) { 
			peopleInRoom[socket.id] = {'name' : people[socket.id].name, 'card' : people[socket.id].card};
		});

		io.sockets.in(data.room).emit('cardSelected', peopleInRoom);
	 });

	/**
	 * Client changes User Story
	 */

	 socket.on('newUserStory', function(userStory){
	 	socket.emit('newUserStory', userStory);
	 	socket.broadcast.emit('newUserStory', userStory);
	 	currentUserStory = userStory;
	 });

	 /**
	 * Reveal cards to all clients
	 */

	 socket.on('revealCards', function(){
	 	socket.emit('revealCards');
	 	socket.broadcast.emit('revealCards');
	 });

	 /**
	 * Play Again
	 */

	 socket.on('playAgain', function(){
	 	// Set all cards to undefined
	 	var i;
		for (i in people) {
			if (people.hasOwnProperty(i)) {
					people[i].card = undefined;
			}
		}
	 	socket.emit('playAgain', people);
	 	socket.broadcast.emit('playAgain', people);
	 });



	/**
	 * Client disconnects
	 */
	// If someones disconnects
	socket.on('disconnect', function() {
		var user = people[socket.id].name;
		// Delete it's reference in the people array
		delete people[socket.id];
		// Then broadcast that someone disconnected, with the remaining participants
		socket.broadcast.emit('participants', {people: people, disconnect: user});
		console.log(socket.id+' : Socket disconnected');
	});
});
