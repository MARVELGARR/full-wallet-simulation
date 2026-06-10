const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
    res.json({ message: "Core Banking Service represents here" });
});

app.listen(PORT, () => {
    console.log(`Core Banking Service running on port ${PORT}`);
});
