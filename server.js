const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Categorized Word Decks
const WORD_DECKS = {
  malayalam: {
    easy: ["Drishyam", "Premam", "Lucifer", "Spadikam", "Kilukkam", "Aavesham", "CID Moosa", "Bangalore Days", "Godfather", "Kireedam", "In Harihar Nagar", "Punjabi House", "Meesha Madhavan"],
    medium: ["Manichitrathazhu", "Kumbalangi Nights", "Anjaam Pathiraa", "Minnal Murali", "Maheshinte Prathikaaram", "Joji", "Sandesham", "Devasuram", "Chithram", "Thattathin Marayathu", "Ustad Hotel", "Rorschach"],
    hard: ["Yavanika", "Mathilukal", "Guru", "Perumthachan", "Sadayam", "Vanaprastham", "Thoovanathumbikal", "Irakal", "Vidheyan", "Adaminte Makan Abu", "Elippathayam"]
  },
  english: {
    easy: ["Titanic", "Avatar", "Jurassic Park", "Spider-Man", "Iron Man", "Frozen", "Harry Potter", "The Lion King", "Jaws", "Shrek", "Home Alone", "Finding Nemo"],
    medium: ["Inception", "Interstellar", "The Dark Knight", "The Matrix", "Gladiator", "Pulp Fiction", "Forrest Gump", "Fight Club", "Pirates of the Caribbean", "Back to the Future"],
    hard: ["Oppenheimer", "Memento", "Blade Runner", "Shutter Island", "The Prestige", "No Country for Old Men", "Whiplash", "The Grand Budapest Hotel", "Parasite", "Arrival"]
  },
  personalities: {
    easy: ["Mohanlal", "Mammootty", "Dulquer Salmaan", "Fahadh Faasil", "Cristiano Ronaldo", "Lionel Messi", "Michael Jackson", "Charlie Chaplin", "Virat Kohli", "Narendra Modi"],
    medium: ["Tovino Thomas", "Prithviraj", "Kamal Haasan", "Rajinikanth", "Shah Rukh Khan", "Leonardo DiCaprio", "Keanu Reeves", "Albert Einstein", "Elon Musk"],
    hard: ["Adoor Gopalakrishnan", "Padmarajan", "K. J. Yesudas", "Christopher Nolan", "Quentin Tarantino", "Marilyn Monroe", "Nikola Tesla", "Steve Jobs"]
  },
  idioms: {
    easy: ["Piece of cake", "Break a leg", "Cold feet", "Time is money", "Raining cats and dogs", "Better late than never"],
    medium: ["Bite the bullet", "Spill the beans", "Burn the midnight oil", "Barking up the wrong tree", "Cry over spilled milk", "Under the weather"],
    hard: ["Through the grapevine", "Elephant in the room", "Devil's advocate", "Wild goose chase", "Bite off more than you can chew", "Burn bridges"]
  },
  actions: {
    easy: ["Brushing teeth", "Cooking dinner", "Playing badminton", "Driving a car", "Taking a selfie", "Dancing", "Fishing", "Flying a kite"],
    medium: ["Walking on a tightrope", "Changing a flat tyre", "Ordering in a busy restaurant", "Assembling furniture", "Milking a cow", "Bowling a strike"],
    hard: ["Defusing a bomb", "Performing surgery", "Scuba diving with sharks", "Surviving a zombie attack", "Landing a parachute", "Bungee jumping"]
  },
  abstract: {
    easy: ["Happiness", "Fear", "Jealousy", "Victory", "Silence", "Friendship", "Midnight", "Freedom"],
    medium: ["Nostalgia", "Confusion", "Deja vu", "Procrastination", "Guilt", "Inspiration", "Anxiety", "Solitude"],
    hard: ["Existential crisis", "Serendipity", "Melancholy", "Claustrophobia", "Ephemeral", "Ambiguity", "Ennui"]
  },
  animals: {
    easy: ["Elephant", "Lion", "Kangaroo", "Penguin", "Monkey", "Giraffe", "Rabbit", "Snake", "Cat", "Dog", "Tiger"],
    medium: ["Chameleon", "Gorilla", "Platypus", "Crocodile", "Cheetah", "Sloth", "Hippopotamus", "Koala", "Peacock", "Panda"],
    hard: ["Komodo Dragon", "Axolotl", "Pangolin", "Narwhal", "Armadillo", "Capybara", "Honey Badger", "Mantis Shrimp"]
  }
};

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function cleanString(str) {
  return (str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(s1, s2) {
  const a = s1 || '', b = s2 || '';
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateSimilarity(s1, s2) {
  const c1 = cleanString(s1);
  const c2 = cleanString(s2);
  if (c1 === c2) return 1.0;
  if (!c1.length || !c2.length) return 0.0;
  const dist = levenshteinDistance(c1, c2);
  const maxLen = Math.max(c1.length, c2.length);
  return 1 - (dist / maxLen);
}

function pickUniqueWord(room) {
  const categoryDeck = WORD_DECKS[room.category] || WORD_DECKS['malayalam'];
  const wordPool = categoryDeck[room.difficulty] || categoryDeck['medium'];

  let availableWords = wordPool.filter(w => !room.usedWords.has(w));
  if (availableWords.length === 0) {
    room.usedWords.clear();
    availableWords = [...wordPool];
  }

  const selectedWord = availableWords[Math.floor(Math.random() * availableWords.length)];
  room.usedWords.add(selectedWord);
  return selectedWord;
}

io.on('connection', (socket) => {

  // Create Room
  socket.on('createRoom', ({ playerName, category, difficulty, sessionId }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) roomCode = generateRoomCode();

    const host = {
      sessionId: sessionId || socket.id,
      socketId: socket.id,
      name: playerName || 'Host',
      score: 0,
      hasGuessed: false,
      attemptsLeft: 3,
      isHost: true,
      connected: true
    };

    rooms[roomCode] = {
      code: roomCode,
      category: category || 'malayalam',
      difficulty: difficulty || 'medium',
      players: [host],
      usedWords: new Set(),
      currentActorIndex: 0,
      totalTurnsCompleted: 0,
      currentWord: '',
      correctGuessesCount: 0,
      timer: null,
      timeLeft: 120,
      inRound: false,
      lastRoundState: null
    };

    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, player: host });
    io.in(roomCode).emit('playerListUpdate', rooms[roomCode].players);
  });

  // Join Room
  socket.on('joinRoom', ({ roomCode, playerName, sessionId }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms[code];

    if (!room) return socket.emit('errorMessage', 'Room not found. Please check code.');

    // Look for existing player in session
    let existingPlayer = room.players.find(p => p.sessionId === sessionId || (p.name.toLowerCase() === playerName.toLowerCase() && !p.connected));

    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.name = playerName || existingPlayer.name;
      existingPlayer.connected = true;
      socket.join(code);

      socket.emit('roomJoined', { roomCode: code, player: existingPlayer });
      io.in(code).emit('playerListUpdate', room.players);

      if (room.inRound) {
        const actor = room.players[room.currentActorIndex];
        const isActor = actor && actor.sessionId === existingPlayer.sessionId;

        if (isActor) {
          socket.emit('roundStarted', {
            role: 'actor',
            category: room.category,
            difficulty: room.difficulty,
            word: room.currentWord,
            actorName: actor.name,
            currentTurn: room.totalTurnsCompleted + 1,
            totalTurns: room.players.length
          });
        } else {
          socket.emit('roundStarted', {
            role: 'guesser',
            category: room.category,
            difficulty: room.difficulty,
            actorName: actor.name,
            hintPattern: room.currentWord.replace(/[a-zA-Z0-9]/g, '_ '),
            currentTurn: room.totalTurnsCompleted + 1,
            totalTurns: room.players.length,
            attemptsLeft: existingPlayer.attemptsLeft,
            hasGuessed: existingPlayer.hasGuessed
          });
        }
        socket.emit('timerTick', room.timeLeft);
      } else if (room.lastRoundState) {
        socket.emit('roundEnded', room.lastRoundState);
      }
      return;
    }

    if (room.inRound) return socket.emit('errorMessage', 'Game in progress. Please wait.');
    if (room.players.length >= 20) return socket.emit('errorMessage', 'Room is full.');

    const newPlayer = {
      sessionId: sessionId || socket.id,
      socketId: socket.id,
      name: playerName || `Player ${room.players.length + 1}`,
      score: 0,
      hasGuessed: false,
      attemptsLeft: 3,
      isHost: false,
      connected: true
    };

    room.players.push(newPlayer);
    socket.join(code);

    socket.emit('roomJoined', { roomCode: code, player: newPlayer });
    io.in(code).emit('playerListUpdate', room.players);
  });

  // Start Round
  socket.on('startRound', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.players.length === 0) return;

    const requester = room.players.find(p => p.socketId === socket.id);
    if (!requester || !requester.isHost) return;

    if (room.totalTurnsCompleted >= room.players.length) {
      return endMatch(roomCode);
    }

    room.inRound = true;
    room.correctGuessesCount = 0;
    room.timeLeft = 120;

    room.players.forEach(p => {
      p.hasGuessed = false;
      p.attemptsLeft = 3;
    });

    const actor = room.players[room.currentActorIndex];
    room.currentWord = pickUniqueWord(room);

    // Send role to each player directly
    room.players.forEach(p => {
      if (p.socketId === actor.socketId) {
        io.to(p.socketId).emit('roundStarted', {
          role: 'actor',
          category: room.category,
          difficulty: room.difficulty,
          word: room.currentWord,
          actorName: actor.name,
          currentTurn: room.totalTurnsCompleted + 1,
          totalTurns: room.players.length
        });
      } else {
        io.to(p.socketId).emit('roundStarted', {
          role: 'guesser',
          category: room.category,
          difficulty: room.difficulty,
          actorName: actor.name,
          hintPattern: room.currentWord.replace(/[a-zA-Z0-9]/g, '_ '),
          currentTurn: room.totalTurnsCompleted + 1,
          totalTurns: room.players.length,
          attemptsLeft: 3,
          hasGuessed: false
        });
      }
    });

    clearInterval(room.timer);
    room.timer = setInterval(() => {
      room.timeLeft--;
      io.in(roomCode).emit('timerTick', room.timeLeft);

      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    }, 1000);
  });

  // Submit Guess
  socket.on('submitGuess', ({ roomCode, guess }) => {
    const room = rooms[roomCode];
    if (!room || !room.inRound || room.timeLeft <= 0) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.hasGuessed || player.attemptsLeft <= 0) return;

    const actor = room.players[room.currentActorIndex];
    if (actor && actor.socketId === socket.id) return;

    const similarity = calculateSimilarity(guess, room.currentWord);

    if (similarity >= 0.90 || (room.currentWord.length <= 6 && similarity >= 0.82)) {
      player.hasGuessed = true;
      room.correctGuessesCount++;

      const diffMultiplier = room.difficulty === 'hard' ? 2.0 : (room.difficulty === 'medium' ? 1.5 : 1.0);
      const basePointsTier = [100, 80, 60];
      const basePoints = basePointsTier[room.correctGuessesCount - 1] || 40;
      
      const speedBonus = Math.floor((room.timeLeft / 120) * 30);
      const totalEarned = Math.round((basePoints * diffMultiplier) + speedBonus);

      player.score += totalEarned;
      if (actor) actor.score += Math.round(25 * diffMultiplier);

      socket.emit('guessResult', {
        status: 'correct',
        points: totalEarned,
        attemptsLeft: player.attemptsLeft
      });

      io.in(roomCode).emit('playerListUpdate', room.players);

      const activeGuessers = room.players.filter(p => p.socketId !== actor.socketId && p.connected);
      if (room.correctGuessesCount >= activeGuessers.length) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    } else if (similarity >= 0.70) {
      socket.emit('guessResult', {
        status: 'close',
        attemptsLeft: player.attemptsLeft
      });
    } else {
      player.attemptsLeft--;
      socket.emit('guessResult', {
        status: 'incorrect',
        attemptsLeft: player.attemptsLeft
      });

      const allDone = room.players
        .filter(p => p.socketId !== actor.socketId && p.connected)
        .every(p => p.hasGuessed || p.attemptsLeft <= 0);

      if (allDone) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    }
  });

  // Kick Player
  socket.on('kickPlayer', ({ roomCode, targetSessionId }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const requester = room.players.find(p => p.socketId === socket.id);
    if (!requester || !requester.isHost) return;

    const targetIndex = room.players.findIndex(p => p.sessionId === targetSessionId);
    if (targetIndex === -1) return;

    const targetPlayer = room.players[targetIndex];
    io.to(targetPlayer.socketId).emit('kicked');

    room.players.splice(targetIndex, 1);

    if (room.inRound && room.currentActorIndex === targetIndex) {
      clearInterval(room.timer);
      endRound(roomCode);
    } else {
      if (targetIndex < room.currentActorIndex) {
        room.currentActorIndex = Math.max(0, room.currentActorIndex - 1);
      }
      io.in(roomCode).emit('playerListUpdate', room.players);
    }
  });

  // Leave Game
  socket.on('leaveRoom', ({ roomCode }) => {
    handlePlayerLeaving(socket, roomCode);
  });

  // Restart Match
  socket.on('restartMatch', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const requester = room.players.find(p => p.socketId === socket.id);
    if (!requester || !requester.isHost) return;

    room.currentActorIndex = 0;
    room.totalTurnsCompleted = 0;
    room.usedWords.clear();
    room.players.forEach(p => { p.score = 0; p.hasGuessed = false; p.attemptsLeft = 3; });
    
    io.in(roomCode).emit('playerListUpdate', room.players);
    io.in(roomCode).emit('matchReset');
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        
        if (player.isHost) {
          const nextActive = room.players.find(p => p.connected && p.sessionId !== player.sessionId);
          if (nextActive) {
            player.isHost = false;
            nextActive.isHost = true;
            io.to(nextActive.socketId).emit('promotedToHost');
          }
        }
        
        io.in(code).emit('playerListUpdate', room.players);
        break;
      }
    }
  });

  function handlePlayerLeaving(sock, code) {
    const room = rooms[code];
    if (!room) return;

    const index = room.players.findIndex(p => p.socketId === sock.id);
    if (index !== -1) {
      const removed = room.players.splice(index, 1)[0];
      sock.leave(code);

      if (removed.isHost && room.players.length > 0) {
        room.players[0].isHost = true;
        io.to(room.players[0].socketId).emit('promotedToHost');
      }

      if (room.players.length === 0) {
        clearInterval(room.timer);
        delete rooms[code];
      } else {
        io.in(code).emit('playerListUpdate', room.players);
        if (room.inRound && room.currentActorIndex === index) {
          clearInterval(room.timer);
          endRound(code);
        }
      }
    }
  }

  function endRound(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    room.inRound = false;
    room.totalTurnsCompleted++;

    const isMatchComplete = room.totalTurnsCompleted >= room.players.length;

    room.lastRoundState = {
      word: room.currentWord,
      leaderboard: room.players,
      isMatchComplete,
      currentTurn: room.totalTurnsCompleted,
      totalTurns: room.players.length
    };

    io.in(roomCode).emit('roundEnded', room.lastRoundState);
    room.currentActorIndex = (room.currentActorIndex + 1) % room.players.length;
  }

  function endMatch(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    io.in(roomCode).emit('matchEnded', { leaderboard: room.players });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server online on port ${PORT}`));