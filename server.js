const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (front-end) from repo root so the hosted server can also deliver the UI.
app.use(express.static(path.join(__dirname)));

// MongoDB connection (hardcoded, sin variables de entorno)
const MONGODB_URI = 'mongodb+srv://daniel:daniel25@capacitacion.nxd7yl9.mongodb.net/?retryWrites=true&w=majority&appName=capacitacion&authSource=admin';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Schemas
const ItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // external id used by client
  name: { type: String, required: true },
  code: String,
  brand: String,
  quantity: { type: Number, default: 0 },
  type: String
}, { timestamps: true });

const TicketSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // e.g. 't'+Date.now()
  type: { type: String, enum: ['take','return'], required: true },
  itemId: { type: String, required: true },
  username: { type: String, required: true },
  qty: { type: Number, required: true },
  destination: String,
  signature: String,
  date: { type: Date, default: Date.now },
  forcedReturn: { type: Boolean, default: false },
  originalUserTaken: Number
}, { timestamps: true });

const Item = mongoose.model('Item', ItemSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);

// Helper: generate simple unique ids
function genId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.floor(Math.random()*9000+1000).toString(36);
}

// API: get items
app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.find({}).lean();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo items' });
  }
});

// API: get tickets
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find({}).lean();
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo tickets' });
  }
});

// API: create item
app.post('/api/items', async (req, res) => {
  try {
    const { id, name, code, brand, quantity = 0, type } = req.body || {};
    if(!name || !brand) return res.status(400).json({ error: 'name y brand son obligatorios' });

    let finalId = id && String(id).trim();
    if(!finalId) {
      const letters = (String(name||'').replace(/[^a-zA-Z]/g,'').toUpperCase().slice(0,4)+'XXXX').slice(0,4);
      finalId = letters + String(Math.floor(1000 + Math.random()*9000));
    }
    // ensure uniqueness
    let exists = await Item.findOne({ id: finalId });
    if(exists) finalId = finalId + '-' + Date.now();

    const finalCode = code && String(code).trim() ? code.trim() : (finalId.slice(0,4) + '-' + finalId.slice(4));
    const item = new Item({ id: finalId, name: String(name), code: finalCode, brand: String(brand), quantity: Number(quantity)||0, type: type||'' });
    await item.save();

    io.emit('items:update');
    res.status(201).json({ ok:true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando item' });
  }
});

// Helper: compute net taken by a user for an item
async function computeUserTaken(itemId, username) {
  const tickets = await Ticket.find({ itemId, username }).lean();
  let net = 0;
  tickets.forEach(t => {
    net += (t.type === 'take') ? Number(t.qty||0) : -Number(t.qty||0);
  });
  return net;
}

// POST take
app.post('/api/take', async (req, res) => {
  try {
    const { itemId, username, qty, destination, signature } = req.body || {};
    if(!itemId || !username || !qty) return res.status(400).json({ error:'Datos incompletos' });
    if(!signature || String(signature).trim()==='') return res.status(400).json({ error:'Firma obligatoria' });

    const item = await Item.findOne({ id: itemId });
    if(!item) return res.status(404).json({ error:'Artículo no encontrado' });
    if(Number(qty) > item.quantity) return res.status(400).json({ error:'No hay suficiente cantidad disponible' });

    item.quantity = item.quantity - Number(qty);
    await item.save();

    const ticket = new Ticket({
      id: genId('t'),
      type: 'take',
      itemId,
      username,
      qty: Number(qty),
      destination: destination||'',
      signature,
      date: new Date()
    });
    await ticket.save();

    io.emit('items:update');
    io.emit('tickets:update');
    res.json({ ok:true, ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'Error procesando retiro' });
  }
});

// POST return
app.post('/api/return', async (req, res) => {
  try {
    const { itemId, username, qty, destination, signature, force } = req.body || {};
    if(!itemId || !username || !qty) return res.status(400).json({ error:'Datos incompletos' });
    if(!signature || String(signature).trim()==='') return res.status(400).json({ error:'Firma obligatoria' });

    const item = await Item.findOne({ id: itemId });
    if(!item) return res.status(404).json({ error:'Artículo no encontrado' });

    const userTaken = await computeUserTaken(itemId, username);
    if(!force && Number(qty) > userTaken) return res.status(400).json({ error:'La persona no tiene esa cantidad para devolver' });

    item.quantity = item.quantity + Number(qty);
    await item.save();

    const ticket = new Ticket({
      id: genId('t'),
      type: 'return',
      itemId,
      username,
      qty: Number(qty),
      destination: destination||'',
      signature,
      date: new Date(),
      forcedReturn: !!force,
      originalUserTaken: Number(userTaken)
    });
    await ticket.save();

    io.emit('items:update');
    io.emit('tickets:update');
    res.json({ ok:true, ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'Error procesando devolución' });
  }
});

// socket.io: basic connection
io.on('connection', (socket) => {
  // clients can join/leave if needed; emit confirmation
  socket.emit('connected', { msg: 'welcome' });
});

// fallback root to serve index.html if exists
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), err => {
    if(err) res.status(404).send('Index not found');
  });
});

// start server (puerto fijo, sin variables de entorno)
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
