const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());

// --- Helper Functions for Data Persistence ---

// Read data from the JSON file and return the inventory array
const readData = () => {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        // Accept either { inventory: [...] } or a raw array
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.inventory)) return parsed.inventory;
        return [];
    } catch (error) {
        // If file doesn't exist or is invalid, return an empty array
        return [];
    }
};

// Write inventory array to the JSON file as { inventory: [...] }
const writeData = (inventoryArray) => {
    const payload = { inventory: inventoryArray };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
};

// Find an item by name (case-insensitive) and strength
const findItem = (items, name, strength) => {
    return items.find(item =>
        item.name.toLowerCase() === name.toLowerCase() &&
        item.strength.toLowerCase() === strength.toLowerCase()
    );
};

// --- API Routes ---

// 1. GET Inventory
app.get('/api/inventory', (req, res) => {
    const inventory = readData();
    // Sort inventory by expiryDate ascending
    inventory.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    res.json(inventory);
});

// 2. POST Add Stock (from add-stock.html)
app.post('/api/inventory', (req, res) => {
    const { name, strength, quantity, expiryDate } = req.body;

    if (!name || !strength || quantity == null || !expiryDate) {
        return res.status(400).json({ error: 'Missing required fields: name, strength, quantity, and expiryDate.' });
    }

    let inventory = readData();

    // Check for existing item with the exact name and strength
    const existingItem = findItem(inventory, name, strength);

    if (existingItem) {
        // Update existing item: increment quantity and use the *earliest* expiry date if new one is earlier
        existingItem.quantity = Number(existingItem.quantity) + Number(quantity);
        const existingExpiry = new Date(existingItem.expiryDate);
        const newExpiry = new Date(expiryDate);

        if (newExpiry < existingExpiry) {
            existingItem.expiryDate = expiryDate;
        }

        writeData(inventory);
        return res.status(200).json({ message: `Stock for ${name} (${strength}) updated and quantity increased to ${existingItem.quantity}.` });
    } else {
        // Add new item
        const newItem = {
            id: Date.now(), // Simple unique ID
            name,
            strength,
            quantity: Number(quantity),
            expiryDate
        };
        inventory.push(newItem);
        writeData(inventory);
        return res.status(201).json({ message: `${name} (${strength}) added to inventory!` });
    }
});

// 3. POST Record Sale (from inventory.html)
app.post('/api/sales', (req, res) => {
    const { medicine, quantity } = req.body;
    const saleQty = Number(quantity);

    if (!medicine || saleQty <= 0) {
        return res.status(400).json({ error: 'Invalid medicine or quantity.' });
    }

    let inventory = readData();

    // Find all matching items (by name) and decrement from the oldest stock first
    let matchingStocks = inventory
        .filter(item => item.name.toLowerCase() === medicine.toLowerCase() && item.quantity > 0)
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)); // Sort by earliest expiry date

    let remainingSale = saleQty;

    for (const stock of matchingStocks) {
        if (remainingSale === 0) break;

        if (stock.quantity >= remainingSale) {
            // Full sale fulfilled by this stock
            stock.quantity -= remainingSale;
            remainingSale = 0;
            break;
        } else {
            // Partial sale, deplete this stock
            remainingSale -= stock.quantity;
            stock.quantity = 0;
        }
    }

    if (remainingSale > 0) {
        return res.status(400).json({ error: `Not enough stock for ${medicine}. Missing ${remainingSale} units.` });
    }

    // Clean up fully depleted items and rewrite
    inventory = inventory.filter(item => item.quantity > 0);
    writeData(inventory);

    res.json({ message: `Sale of ${saleQty} units of ${medicine} recorded successfully!` });
});

// 4. DELETE Item
app.delete('/api/inventory/:name', (req, res) => {
    const itemName = req.params.name;
    let inventory = readData();

    // Remove all stock entries that match the name (case-insensitive)
    const initialLength = inventory.length;
    inventory = inventory.filter(item => item.name.toLowerCase() !== itemName.toLowerCase());

    if (inventory.length === initialLength) {
        return res.status(404).json({ error: `No medicine found with the name: ${itemName}.` });
    }

    writeData(inventory);
    res.json({ message: `${itemName} and all its stock entries have been deleted.` });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API Base URL is http://localhost:${PORT}/api`);
});
