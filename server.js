const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const SUPERCELL_TOKEN = process.env.SUPERCELL_TOKEN;
const SC_API = 'https://api.brawlstars.com/v1';

// Cache em memória para resposta instantânea
let statsCache = {
    lastUpdate: 0,
    updating: false,
    byMapId: {},
    byMapName: {},
    byMode: {},
    global: {}
};

function norm(str) {
    return (str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function recordResult(bucket, key, brawlerId, isWin) {
    if (!key || !brawlerId) return;
    if (!bucket[key]) bucket[key] = {};
    if (!bucket[key][brawlerId]) bucket[key][brawlerId] = { wins: 0, total: 0 };
    bucket[key][brawlerId].total += 1;
    if (isWin) bucket[key][brawlerId].wins += 1;
}

// Motor Oficial: Lê os Battlelogs do Top Global/BR direto na Supercell
async function atualizarEstatisticasOficiais() {
    if (statsCache.updating || !SUPERCELL_TOKEN) return;
    statsCache.updating = true;

    try {
        const headers = { 'Authorization': `Bearer ${SUPERCELL_TOKEN}` };
        const [globalRank, brRank] = await Promise.allSettled([
            axios.get(`${SC_API}/rankings/global/players`, { headers, timeout: 6000 }),
            axios.get(`${SC_API}/rankings/BR/players`, { headers, timeout: 6000 })
        ]);

        let players = [];
        if (globalRank.status === 'fulfilled' && globalRank.value.data.items) {
            players.push(...globalRank.value.data.items.slice(0, 15));
        }
        if (brRank.status === 'fulfilled' && brRank.value.data.items) {
            players.push(...brRank.value.data.items.slice(0, 15));
        }

        const uniqueTags = [...new Set(players.map(p => p.tag))].slice(0, 25);

        const logs = await Promise.allSettled(
            uniqueTags.map(tag =>
                axios.get(`${SC_API}/players/${encodeURIComponent(tag)}/battlelog`, { headers, timeout: 6000 })
                    .then(res => ({ tag, items: res.data.items || [] }))
            )
        );

        const byMapId = {}, byMapName = {}, byMode = {}, global = {};

        logs.forEach(res => {
            if (res.status !== 'fulfilled') return;
            const playerTag = res.value.tag;

            res.value.items.forEach(item => {
                const ev = item.event || {};
                const battle = item.battle || {};
                const mapId = ev.id ? String(ev.id) : null;
                const mapName = norm(ev.map);
                const mode = norm(ev.mode || battle.mode);

                if (battle.teams && Array.isArray(battle.teams)) {
                    let myTeamIndex = -1;
                    battle.teams.forEach((team, idx) => {
                        if (team.some(p => p.tag === playerTag)) myTeamIndex = idx;
                    });
                    if (myTeamIndex === -1 || !battle.result || battle.result === 'draw') return;

                    const playerWon = battle.result === 'victory';
                    battle.teams.forEach((team, idx) => {
                        const isWin = (idx === myTeamIndex) ? playerWon : !playerWon;
                        team.forEach(p => {
                            const bId = p.brawler ? p.brawler.id : null;
                            if (!bId) return;
                            recordResult(byMapId, mapId, bId, isWin);
                            recordResult(byMapName, mapName, bId, isWin);
                            recordResult(byMode, mode, bId, isWin);
                            recordResult({ global }, 'global', bId, isWin);
                        });
                    });
                } else if (battle.players && Array.isArray(battle.players)) {
                    battle.players.forEach(p => {
                        const bId = p.brawler ? p.brawler.id : null;
                        if (!bId || !p.rank) return;
                        const isWin = p.rank <= 4;
                        recordResult(byMapId, mapId, bId, isWin);
                        recordResult(byMapName, mapName, bId, isWin);
                        recordResult(byMode, mode, bId, isWin);
                        recordResult({ global }, 'global', bId, isWin);
                    });
                }
            });
        });

        statsCache = {
            lastUpdate: Date.now(),
            updating: false,
            byMapId,
            byMapName,
            byMode,
            global: global.global || {}
        };
        console.log('✅ Cache de Win Rates Oficiais atualizado com sucesso!');
    } catch (err) {
        console.error('Erro ao atualizar cache oficial:', err.message);
        statsCache.updating = false;
    }
}

app.get('/ip', async (req, res) => {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        res.json({ meu_ip_no_render: response.data.ip });
    } catch (error) {
        res.status(500).json({ error: "Não foi possível descobrir o IP" });
    }
});

// O ping do UptimeRobot já mantém o cache de Win Rates sempre atualizado em segundo plano
app.get('/ping', (req, res) => {
    if (Date.now() - statsCache.lastUpdate > 8 * 60 * 1000) {
        atualizarEstatisticasOficiais();
    }
    res.send('Servidor acordado e atualizado! ⚡');
});

app.get('/api/rotacao', async (req, res) => {
    if (!SUPERCELL_TOKEN) {
        return res.status(500).json({ error: "Você ainda não configurou o SUPERCELL_TOKEN no Render!" });
    }
    try {
        const response = await axios.get(`${SC_API}/events/rotation`, {
            headers: { 'Authorization': `Bearer ${SUPERCELL_TOKEN}` }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Falha ao buscar rotação oficial" });
    }
});

// Rota que devolve os Win Rates reais calculados pela API da Supercell
app.get('/api/winrates/:mapId', async (req, res) => {
    try {
        if (Date.now() - statsCache.lastUpdate > 10 * 60 * 1000 && Object.keys(statsCache.global).length === 0) {
            await atualizarEstatisticasOficiais();
        } else if (Date.now() - statsCache.lastUpdate > 10 * 60 * 1000) {
            atualizarEstatisticasOficiais();
        }

        const mapId = String(req.params.mapId);
        const mapName = norm(req.query.name || '');
        const mode = norm(req.query.mode || '');

        const mapBucket = statsCache.byMapId[mapId] || statsCache.byMapName[mapName] || {};
        const modeBucket = statsCache.byMode[mode] || {};
        const globalBucket = statsCache.global || {};

        const allBrawlerIds = new Set([
            ...Object.keys(mapBucket),
            ...Object.keys(modeBucket),
            ...Object.keys(globalBucket)
        ]);

        const stats = [];
        allBrawlerIds.forEach(bId => {
            const m = mapBucket[bId] || { wins: 0, total: 0 };
            const md = modeBucket[bId] || { wins: 0, total: 0 };
            const g = globalBucket[bId] || { wins: 0, total: 0 };

            // Peso maior para o mapa exato, seguido pelo modo de jogo e meta global
            const weightedWins = (m.wins * 3) + (md.wins * 1.5) + (g.wins * 0.5) + 2.5;
            const weightedTotal = (m.total * 3) + (md.total * 1.5) + (g.total * 0.5) + 5;

            const winRate = Math.min(85, Math.max(35, Math.round((weightedWins / weightedTotal) * 1000) / 10));
            stats.push({
                brawler: Number(bId),
                winRate,
                useRate: m.total + md.total
            });
        });

        res.json({ stats });
    } catch (error) {
        res.status(500).json({ error: "Falha ao calcular porcentagens oficiais" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT} 🚀`);
    atualizarEstatisticasOficiais();
});
