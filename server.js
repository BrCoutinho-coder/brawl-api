const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const SUPERCELL_TOKEN = process.env.SUPERCELL_TOKEN;

app.get('/ip', async (req, res) => {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        res.json({ meu_ip_no_render: response.data.ip });
    } catch (error) {
        res.status(500).json({ error: "Não foi possível descobrir o IP" });
    }
});

app.get('/ping', (req, res) => {
    res.send('Servidor acordado! ⚡');
});

app.get('/api/rotacao', async (req, res) => {
    if (!SUPERCELL_TOKEN) {
        return res.status(500).json({ error: "Você ainda não configurou o SUPERCELL_TOKEN no Render!" });
    }
    
    try {
        const response = await axios.get('https://api.brawlstars.com/v1/events/rotation', {
            headers: { 'Authorization': `Bearer ${SUPERCELL_TOKEN}` }
        });
        res.json(response.data);
    } catch (error) {
        console.error("Erro Supercell:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Falha ao buscar rotação oficial" });
    }
});

app.get('/api/winrates/:mapId', async (req, res) => {
    try {
        const response = await axios.get(`https://api.brawlapi.com/v1/maps/${req.params.mapId}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Falha ao buscar porcentagens" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT} 🚀`);
});