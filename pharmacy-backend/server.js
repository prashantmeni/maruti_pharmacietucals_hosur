const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// --- Middleware ---
app.use(cors()); // Allow requests from your frontend (e.g., localhost:8000)
app.use(express.json()); // Enable the app to parse JSON body content

// Helper function to read data from data.json
const readData = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data file:', error.message);
        return { inventory: [] };
    }
};

// Helper function to write data to data.json
const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
};

// --- API Routes ---
const API_BASE = '/api';

// 1. GET: Retrieve all inventory items (Used by index.html & inventory.html)
app.get(`${API_BASE}/inventory`, (req, res) => {
    const data = readData();
    res.json(data.inventory);
});

// 2. POST: Add a new stock item (Used by add-stock.html)
app.post(`${API_BASE}/inventory`, (req, res) => {
    const data = readData();
    const { name, strength, quantity, expiryDate } = req.body;

    // Server-side validation
    if (!name || !strength || !quantity || !expiryDate || quantity <= 0) {
        return res.status(400).json({ error: "Missing or invalid required fields (name, strength, quantity, expiryDate)." });
    }

    // Check for exact duplicates (same name, strength, and expiry date)
    const exists = data.inventory.some(item => 
        item.name === name && 
        item.strength === strength && 
        item['expiry-date'] === expiryDate
    );

    if (exists) {
        return res.status(409).json({ error: "Stock item with the same name, strength, and expiry date already exists. Consider updating quantity instead." });
    }

    const newItem = {
        name,
        strength,
        quantity: parseInt(quantity),
        'expiry-date': expiryDate
    };

    data.inventory.push(newItem);
    writeData(data);

    res.status(201).json({ 
        message: `Stock item "${name} (${strength})" added successfully.`,
        item: newItem
    });
});

// 3. POST: Record a sale (Used by inventory.html sales form)
app.post(`${API_BASE}/sales`, (req, res) => {
    const data = readData();
    const { medicine, quantity } = req.body;
    const saleQty = parseInt(quantity);

    if (!medicine || saleQty <= 0) {
        return res.status(400).json({ error: "Invalid medicine name or quantity." });
    }

    // Find the item with the earliest expiry date to sell first (FIFO logic: First In, First Out)
    const itemIndex = data.inventory
        .filter(item => item.name === medicine && item.quantity >= saleQty)
        .sort((a, b) => new Date(a['expiry-date']) - new Date(b['expiry-date']))
        .map(item => data.inventory.findIndex(i => i.name === item.name && i['expiry-date'] === item['expiry-date']))[0];

    if (itemIndex === undefined) {
        // If the *exact batch* (earliest expiry) isn't enough, we simply fail the request for simplicity, 
        // as the frontend is built to select a product name, not a specific batch.
        // A robust system would aggregate all batches and debit from multiple.
        const currentStock = data.inventory
            .filter(item => item.name === medicine)
            .reduce((sum, item) => sum + item.quantity, 0);

        return res.status(400).json({ error: `Insufficient stock for ${medicine}. Available: ${currentStock}` });
    }

    const item = data.inventory[itemIndex];
    item.quantity -= saleQty;

    // Remove item if quantity hits zero
    if (item.quantity === 0) {
        data.inventory.splice(itemIndex, 1);
        message = `${medicine} stock depleted and removed.`;
    } else {
        message = `${saleQty} units of ${medicine} sold successfully. Remaining: ${item.quantity}`;
    }

    writeData(data);
    res.json({ message });
});


// 4. DELETE: Delete an item (Used by inventory.html delete button)
app.delete(`${API_BASE}/inventory/:name`, (req, res) => {
    const data = readData();
    const nameToDelete = req.params.name;

    // Filter out all items matching the name. A real system would require name + strength + expiry to be unique.
    // For simplicity, we delete all batches matching the name.
    const initialLength = data.inventory.length;
    data.inventory = data.inventory.filter(item => item.name !== nameToDelete);
    const finalLength = data.inventory.length;

    if (initialLength === finalLength) {
        return res.status(404).json({ error: `Medicine "${nameToDelete}" not found.` });
    }

    writeData(data);
    res.json({ message: `All batches of medicine "${nameToDelete}" deleted successfully.` });
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`\nServer is running on http://localhost:${PORT}`);
    console.log(`API base URL: http://localhost:${PORT}${API_BASE}`);
});