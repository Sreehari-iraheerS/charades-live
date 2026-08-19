const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Categorized Word Bank
const WORD_BANK = {
  malayalam: [
    "Manichitrathazhu", "Lucifer", "Drishyam", "Premam", "Kumbalangi Nights", 
    "Aavesham", "Spadikam", "Kilukkam", "Bangalore Days", "Chithram", 
    "Anjaam Pathiraa", "Minnal Murali", "Joji", "Maheshinte Prathikaaram"
  ],
  english: [
    "Inception", "Interstellar", "Titanic", "Avatar", "Gladiator", 
    "The Dark Knight", "Jurassic Park", "The Matrix", "Avengers Endgame", 
    "Spider-Man", "Pulp Fiction", "Forrest Gump"
  ],
  animals: [
    "Kangaroo", "Chameleon", "Gorilla", "Penguin", "Elephant", 
    "Platypus", "Giraffe", "Crocodile", "Sloth", "Hippopotamus", "Cheetah"
  ]
};

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function cleanString(str) {
  return (str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

io.on('connection', (socket) => {

  // Host creates a room
  socket.on('createRoom', ({ playerName, category }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }

    const hostPlayer = {
      id: socket.id,
      name: playerName || 'Host',
      score: 0,
      hasGuessed: false,
      attemptsLeft: 3,
      isHost: true
    };

    rooms[roomCode] = {
      code: roomCode,
      category: category || 'malayalam',
      players: [hostPlayer],
      currentActorIndex: 0,
      currentWord: '',
      correctGuessesCount: 0,
      timer: null,
      timeLeft: 120,
      inRound: false
    };

    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, player: hostPlayer });
    io.to(roomCode).emit('playerListUpdate', rooms[roomCode].players);
  });

  // Player joins an existing room
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      return socket.emit('errorMessage', 'Room code not found.');
    }
    if (room.inRound) {
      return socket.emit('errorMessage', 'Game is already in progress. Wait for round end.');
    }
    if (room.players.length >= 20) {
      return socket.emit('errorMessage', 'Room is full (max 20 players).');
    }

    const player = {
      id: socket.id,
      name: playerName || `Player ${room.players.length + 1}`,
      score: 0,
      hasGuessed: false,
      attemptsLeft: 3,
      isHost: false
    };

    room.players.push(player);
    socket.join(code);

    socket.emit('roomJoined', { roomCode: code, player });
    io.to(code).emit('playerListUpdate', room.players);
  });

  // Host starts the round
  socket.on('startRound', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.players.length === 0) return;

    // Check host permissions
    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer || !requestingPlayer.isHost) return;

    room.inRound = true;
    room.correctGuessesCount = 0;
    room.timeLeft = 120;

    // Reset attempts and guess states for all players
    room.players.forEach(p => {
      p.hasGuessed = false;
      p.attemptsLeft = 3;
    });

    const actor = room.players[room.currentActorIndex];
    const words = WORD_BANK[room.category] || WORD_BANK['malayalam'];
    room.currentWord = words[Math.floor(Math.random() * words.length)];

    // Send secret word to Actor only
    io.to(actor.id).emit('roundStarted', {
      role: 'actor',
      category: room.category,
      word: room.currentWord
    });

    // Send guesser screen to everyone else in the room
    socket.to(roomCode).emit('roundStarted', {
      role: 'guesser',
      category: room.category,
      wordLength: room.currentWord.length,
      hintPattern: room.currentWord.replace(/[a-zA-Z0-9]/g, '_ ')
    });

    // Timer Loop
    clearInterval(room.timer);
    room.timer = setInterval(() => {
      room.timeLeft--;
      io.to(roomCode).emit('timerTick', room.timeLeft);

      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    }, 1000);
  });

  // Guesser submits an answer
  socket.on('submitGuess', ({ roomCode, guess }) => {
    const room = rooms[roomCode];
    if (!room || !room.inRound || room.timeLeft <= 0) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasGuessed || player.attemptsLeft <= 0) return;

    // Make sure actor cannot submit guesses
    const actor = room.players[room.currentActorIndex];
    if (actor.id === socket.id) return;

    const cleanGuess = cleanString(guess);
    const cleanWord = cleanString(room.currentWord);

    if (cleanGuess === cleanWord) {
      player.hasGuessed = true;
      room.correctGuessesCount++;

      // Score Distribution: 1st: 100, 2nd: 80, 3rd: 60, next: 40
      const pointsTable = [100, 80, 60];
      const pointsEarned = pointsTable[room.correctGuessesCount - 1] || 40;
      player.score += pointsEarned;

      // Actor bonus for effective acting
      actor.score += 20;

      socket.emit('guessResult', {
        correct: true,
        points: pointsEarned,
        attemptsLeft: player.attemptsLeft
      });

      io.to(roomCode).emit('playerListUpdate', room.players);

      // Check if all guessers have completed the round
      const totalGuessers = room.players.length - 1;
      if (room.correctGuessesCount >= totalGuessers) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    } else {
      player.attemptsLeft--;
      socket.emit('guessResult', {
        correct: false,
        attemptsLeft: player.attemptsLeft
      });

      // Check if player exhausted chances and if all other guessers are also done
      const allDone = room.players
        .filter(p => p.id !== actor.id)
        .every(p => p.hasGuessed || p.attemptsLeft <= 0);

      if (allDone) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const removed = room.players.splice(index, 1)[0];
        
        // Pass host to next player if host left
        if (removed.isHost && room.players.length > 0) {
          room.players[0].isHost = true;
        }

        if (room.players.length === 0) {
          clearInterval(room.timer);
          delete rooms[code];
        } else {
          io.to(code).emit('playerListUpdate', room.players);
        }
        break;
      }
    }
  });

  function endRound(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    room.inRound = false;

    io.to(roomCode).emit('roundEnded', {
      word: room.currentWord,
      leaderboard: room.players
    });

    // Advance to next actor
    room.currentActorIndex = (room.currentActorIndex + 1) % room.players.length;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Game server online on port ${PORT}`));