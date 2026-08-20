const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Categorized Word Decks partitioned by Difficulty
const WORD_DECKS = {
  malayalam: {
    easy: ["Drishyam", "Premam", "Lucifer", "Spadikam", "Kilukkam", "Aavesham", "CID Moosa", "Bangalore Days", "Godfather", "Kireedam"],
    medium: ["Manichitrathazhu", "Kumbalangi Nights", "Anjaam Pathiraa", "Minnal Murali", "Maheshinte Prathikaaram", "Joji", "Sandesham", "Devasuram", "Chithram", "Thattathin Marayathu"],
    hard: ["Yavanika", "Mathilukal", "Guru", "Perumthachan", "Sadayam", "Vanaprastham", "Thoovanathumbikal", "Irakal", "Vidheyan"]
  },
  english: {
    easy: ["Titanic", "Avatar", "Jurassic Park", "Spider-Man", "Iron Man", "Frozen", "Harry Potter", "The Lion King", "Jaws", "Shrek"],
    medium: ["Inception", "Interstellar", "The Dark Knight", "The Matrix", "Gladiator", "Pulp Fiction", "Forrest Gump", "Fight Club", "Pirates of the Caribbean"],
    hard: ["Oppenheimer", "Memento", "Blade Runner", "Shutter Island", "The Prestige", "No Country for Old Men", "Whiplash", "The Grand Budapest Hotel"]
  },
  personalities: {
    easy: ["Mohanlal", "Mammootty", "Dulquer Salmaan", "Fahadh Faasil", "Cristiano Ronaldo", "Lionel Messi", "Michael Jackson", "Charlie Chaplin"],
    medium: ["Tovino Thomas", "Prithviraj", "Kamal Haasan", "Rajinikanth", "Shah Rukh Khan", "Leonardo DiCaprio", "Keanu Reeves", "Albert Einstein"],
    hard: ["Adoor Gopalakrishnan", "Padmarajan", "K. J. Yesudas", "Christopher Nolan", "Quentin Tarantino", "Marilyn Monroe", "Nikola Tesla"]
  },
  idioms: {
    easy: ["Piece of cake", "Break a leg", "Cold feet", "Time is money", "Raining cats and dogs"],
    medium: ["Bite the bullet", "Spill the beans", "Burn the midnight oil", "Barking up the wrong tree", "Cry over spilled milk"],
    hard: ["Through the grapevine", "Elephant in the room", "Devil's advocate", "Wild goose chase", "Bite off more than you can chew"]
  },
  actions: {
    easy: ["Brushing teeth", "Cooking dinner", "Playing badminton", "Driving a car", "Taking a selfie", "Dancing", "Fishing"],
    medium: ["Walking on a tightrope", "Changing a flat tyre", "Ordering in a busy restaurant", "Assembling furniture", "Milking a cow"],
    hard: ["Defusing a bomb", "Performing surgery", "Scuba diving with sharks", "Surviving a zombie attack", "Landing a parachute"]
  },
  abstract: {
    easy: ["Happiness", "Fear", "Jealousy", "Victory", "Silence", "Friendship", "Midnight"],
    medium: ["Nostalgia", "Confusion", "Dejavu", "Procrastination", "Guilt", "Inspiration", "Anxiety"],
    hard: ["Existential crisis", "Serendipity", "Melancholy", "Claustrophobia", "Ephemeral", "Ambiguity"]
  },
  animals: {
    easy: ["Elephant", "Lion", "Kangaroo", "Penguin", "Monkey", "Giraffe", "Rabbit", "Snake", "Cat", "Dog"],
    medium: ["Chameleon", "Gorilla", "Platypus", "Crocodile", "Cheetah", "Sloth", "Hippopotamus", "Koala", "Peacock"],
    hard: ["Komodo Dragon", "Axolotl", "Pangolin", "Narwhal", "Armadillo", "Capybara", "Honey Badger"]
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

// Levenshtein Distance Algorithm for Fuzzy String Matching
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
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
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

io.on('connection', (socket) => {

  socket.on('createRoom', ({ playerName, category, difficulty }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) roomCode = generateRoomCode();

    const host = {
      id: socket.id,
      name: playerName || 'Player 1',
      score: 0,
      hasGuessed: false,
      attemptsLeft: 3,
      isHost: true
    };

    rooms[roomCode] = {
      code: roomCode,
      category: category || 'malayalam',
      difficulty: difficulty || 'medium',
      players: [host],
      currentActorIndex: 0,
      totalTurnsCompleted: 0,
      currentWord: '',
      correctGuessesCount: 0,
      timer: null,
      timeLeft: 120,
      inRound: false
    };

    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, player: host });
    io.to(roomCode).emit('playerListUpdate', rooms[roomCode].players);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms[code];

    if (!room) return socket.emit('errorMessage', 'Room not found.');
    if (room.inRound) return socket.emit('errorMessage', 'Match currently in progress.');
    if (room.players.length >= 20) return socket.emit('errorMessage', 'Room is full (max 20).');

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

  socket.on('startRound', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.players.length === 0) return;

    const requester = room.players.find(p => p.id === socket.id);
    if (!requester || !requester.isHost) return;

    // Check if match cycle is already complete
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
    const categoryDeck = WORD_DECKS[room.category] || WORD_DECKS['malayalam'];
    const wordPool = categoryDeck[room.difficulty] || categoryDeck['medium'];
    room.currentWord = wordPool[Math.floor(Math.random() * wordPool.length)];

    // Send word to Actor
    io.to(actor.id).emit('roundStarted', {
      role: 'actor',
      category: room.category,
      difficulty: room.difficulty,
      word: room.currentWord,
      actorName: actor.name,
      currentTurn: room.totalTurnsCompleted + 1,
      totalTurns: room.players.length
    });

    // Send view to Guessers
    socket.to(roomCode).emit('roundStarted', {
      role: 'guesser',
      category: room.category,
      difficulty: room.difficulty,
      actorName: actor.name,
      hintPattern: room.currentWord.replace(/[a-zA-Z0-9]/g, '_ '),
      currentTurn: room.totalTurnsCompleted + 1,
      totalTurns: room.players.length
    });

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

  socket.on('submitGuess', ({ roomCode, guess }) => {
    const room = rooms[roomCode];
    if (!room || !room.inRound || room.timeLeft <= 0) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasGuessed || player.attemptsLeft <= 0) return;

    const actor = room.players[room.currentActorIndex];
    if (actor.id === socket.id) return; // Actor cannot guess

    const similarity = calculateSimilarity(guess, room.currentWord);

    // Exact or close match (>= 90% or distance <= 1 on short words)
    if (similarity >= 0.90 || (room.currentWord.length <= 6 && similarity >= 0.82)) {
      player.hasGuessed = true;
      room.correctGuessesCount++;

      // Difficulty multiplier
      const diffMultiplier = room.difficulty === 'hard' ? 2.0 : (room.difficulty === 'medium' ? 1.5 : 1.0);
      const basePointsTier = [100, 80, 60];
      const basePoints = basePointsTier[room.correctGuessesCount - 1] || 40;
      
      // Speed bonus (0 to 30 extra points based on remaining time)
      const speedBonus = Math.floor((room.timeLeft / 120) * 30);
      const totalEarned = Math.round((basePoints * diffMultiplier) + speedBonus);

      player.score += totalEarned;
      actor.score += Math.round(25 * diffMultiplier);

      socket.emit('guessResult', {
        status: 'correct',
        points: totalEarned,
        attemptsLeft: player.attemptsLeft
      });

      io.to(roomCode).emit('playerListUpdate', room.players);

      const totalGuessers = room.players.length - 1;
      if (room.correctGuessesCount >= totalGuessers) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    } else if (similarity >= 0.70) {
      // Near miss - Don't consume an attempt
      socket.emit('guessResult', {
        status: 'close',
        attemptsLeft: player.attemptsLeft
      });
    } else {
      // Incorrect guess
      player.attemptsLeft--;
      socket.emit('guessResult', {
        status: 'incorrect',
        attemptsLeft: player.attemptsLeft
      });

      const allGuessersDone = room.players
        .filter(p => p.id !== actor.id)
        .every(p => p.hasGuessed || p.attemptsLeft <= 0);

      if (allGuessersDone) {
        clearInterval(room.timer);
        endRound(roomCode);
      }
    }
  });

  socket.on('restartMatch', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const requester = room.players.find(p => p.id === socket.id);
    if (!requester || !requester.isHost) return;

    room.currentActorIndex = 0;
    room.totalTurnsCompleted = 0;
    room.players.forEach(p => { p.score = 0; p.hasGuessed = false; p.attemptsLeft = 3; });
    io.to(roomCode).emit('playerListUpdate', room.players);
    io.to(roomCode).emit('matchReset');
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const removed = room.players.splice(index, 1)[0];
        if (removed.isHost && room.players.length > 0) room.players[0].isHost = true;

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
    room.totalTurnsCompleted++;

    const isMatchComplete = room.totalTurnsCompleted >= room.players.length;

    io.to(roomCode).emit('roundEnded', {
      word: room.currentWord,
      leaderboard: room.players,
      isMatchComplete,
      currentTurn: room.totalTurnsCompleted,
      totalTurns: room.players.length
    });

    // Advance to next actor for the subsequent turn
    room.currentActorIndex = (room.currentActorIndex + 1) % room.players.length;
  }

  function endMatch(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    io.to(roomCode).emit('matchEnded', { leaderboard: room.players });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Game Server running on port ${PORT}`));