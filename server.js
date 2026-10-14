const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const SUPERCELL_TOKEN = process.env.SUPERCELL_TOKEN;

// Cabeçalhos para disfarçar o Render e evitar o bloqueio 403 do Cloudflare da BrawlAPI
const BRAWL_API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

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

// 1. Rotação Oficial (Direto da Supercell)
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

// 2. Proxy para a lista de Brawlers (BrawlAPI)
app.get('/api/brawlers', async (req, res) => {
    try {
        const response = await axios.get('https://api.brawlapi.com/v1/brawlers', { headers: BRAWL_API_HEADERS });
        res.json(response.data);
    } catch (error) {
        console.error("Erro BrawlAPI Brawlers:", error.message);
        res.status(500).json({ error: "Falha ao buscar Brawlers" });
    }
});

// 3. Proxy para as Percentagens de Vitória / Mapas (BrawlAPI)
app.get('/api/winrates/:mapId', async (req, res) => {
    try {
        const response = await axios.get(`https://api.brawlapi.com/v1/maps/${req.params.mapId}`, { headers: BRAWL_API_HEADERS });
        res.json(response.data);
    } catch (error) {
        console.error(`Erro BrawlAPI WinRates Map ${req.params.mapId}:`, error.message);
        res.status(500).json({ error: "Falha ao buscar porcentagens" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor proxy rodando na porta ${PORT} 🚀`);
});
