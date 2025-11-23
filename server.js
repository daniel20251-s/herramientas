const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN ---
app.use(cors()); // Permite que tu App React se conecte
app.use(express.json()); // Permite recibir JSON

// CONEXIÓN A MONGODB
// NOTA: Lo ideal es usar variables de entorno (process.env.MONGO_URI) en Render
// Pero para que funcione con el enlace que diste:
const MONGO_URI = "mongodb+srv://daniel:daniel25@capacitacion.nxd7yl9.mongodb.net/?retryWrites=true&w=majority&appName=capacitacion&authSource=admin";

mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado a MongoDB Atlas'))
    .catch(err => console.error('Error conectando a MongoDB:', err));

// --- MODELOS DE DATOS ---

// Modelo de Sitio (Lugar de trabajo)
const SiteSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: String,
    description: String,
    createdAt: { type: Date, default: Date.now }
});
const Site = mongoose.model('Site', SiteSchema);

// Modelo de Ticket (Trabajo realizado)
const TicketSchema = new mongoose.Schema({
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    title: { type: String, required: true },
    description: String,
    status: { type: String, default: 'pendiente' }, // 'pendiente', 'completado'
    createdAt: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', TicketSchema);

// --- RUTAS API ---

app.get('/', (req, res) => {
    res.send('API de Capacitación Funcionando. Usa /api/sites o /api/tickets');
});

// 1. Obtener todos los sitios
app.get('/api/sites', async (req, res) => {
    try {
        const sites = await Site.find().sort({ createdAt: -1 });
        res.json(sites);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Crear un sitio
app.post('/api/sites', async (req, res) => {
    try {
        const newSite = new Site(req.body);
        const savedSite = await newSite.save();
        res.json(savedSite);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Eliminar un sitio (y sus tickets opcionalmente)
app.delete('/api/sites/:id', async (req, res) => {
    try {
        await Site.findByIdAndDelete(req.params.id);
        // Opcional: Borrar tickets asociados
        await Ticket.deleteMany({ siteId: req.params.id });
        res.json({ message: 'Sitio eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Obtener tickets de un sitio específico
app.get('/api/tickets/:siteId', async (req, res) => {
    try {
        const tickets = await Ticket.find({ siteId: req.params.siteId }).sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Crear un ticket
app.post('/api/tickets', async (req, res) => {
    try {
        const newTicket = new Ticket(req.body);
        const savedTicket = await newTicket.save();
        res.json(savedTicket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Eliminar un ticket
app.delete('/api/tickets/:id', async (req, res) => {
    try {
        await Ticket.findByIdAndDelete(req.params.id);
        res.json({ message: 'Ticket eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
