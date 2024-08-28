const API_BASE_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const STATS_API_URL = 'https://chatter-statuesque-promotion.glitch.me/stats';

let currentDeck = { main: [], extra: [], side: [] };
let allCards = [];
let cardCache = new Map();

document.getElementById('fileInput').addEventListener('change', handleFileUpload);
document.getElementById('exportButton').addEventListener('click', exportDeck);
document.getElementById('copyButton').addEventListener('click', copyToClipboard);
document.getElementById('fileInput').addEventListener('click', () => {
    document.getElementById('fileInput').value = null;
    clearDeck();
});

// Cargar y actualizar estadísticas
loadStatistics();

async function loadStatistics() {
    try {
        const response = await axios.get(STATS_API_URL);
        const stats = response.data;

        stats.visitCount++;
        await axios.post(STATS_API_URL, { ...stats });

        updateStatisticsDisplay(stats);
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

function updateStatisticsDisplay(stats) {
    document.getElementById('visitCount').textContent = stats.visitCount;
    document.getElementById('deckCount').textContent = stats.deckCount;
    document.getElementById('averageTime').textContent = stats.averageTime.toFixed(2) + 's';
}

async function handleFileUpload(e) {
    const startTime = performance.now();
    const file = e.target.files[0];
    const content = await file.text();

    // Limpiar el área de exportación y deshabilitar botones
    const exportOutput = document.getElementById('exportOutput');
    exportOutput.value = '';
    exportOutput.style.display = 'none';
    document.getElementById('exportButton').disabled = true;
    document.getElementById('copyButton').style.display = 'none';

    try {
        currentDeck = parseDeck(content);
        await loadAllCards();
        renderDeck();
        updateProgressBar(100);

        // Habilitar botón de exportar una vez que el deck esté cargado
        document.getElementById('exportButton').disabled = false;

        // Actualizar estadísticas
        let response = await axios.get(STATS_API_URL);
        let stats = response.data;
        stats.deckCount++;
        const endTime = performance.now();
        const conversionTime = (endTime - startTime) / 1000; // en segundos
        stats.averageTime = (stats.averageTime * (stats.deckCount - 1) + conversionTime) / stats.deckCount;
        stats.lastUpdated = new Date().toISOString();
        await axios.post(STATS_API_URL, { ...stats });

        updateStatisticsDisplay(stats);
        toastr.success('Deck cargado y convertido con éxito.');
    } catch (error) {
        toastr.error('Error: ' + error.message);
    }
}

function parseDeck(content) {
    const lines = content.split('\n');
    const deck = { main: [], extra: [], side: [] };
    let currentSection = null;

    for (const line of lines) {
        if (line.startsWith('#main')) {
            currentSection = 'main';
        } else if (line.startsWith('#extra')) {
            currentSection = 'extra';
        } else if (line.startsWith('!side')) {
            currentSection = 'side';
        } else if (line.trim() && !line.startsWith('#')) {
            if (currentSection) {
                deck[currentSection].push(line.trim());
            }
        }
    }

    if (deck.main.length === 0 && deck.extra.length === 0) {
        throw new Error('El archivo no contiene un deck válido.');
    }

    return deck;
}

async function loadAllCards() {
    const cardIds = [...new Set([...currentDeck.main, ...currentDeck.extra, ...currentDeck.side])];
    const totalCards = cardIds.length;
    let loadedCards = 0;

    const updateProgress = () => {
        loadedCards++;
        const progress = (loadedCards / totalCards) * 100;
        updateProgressBar(progress);
    };

    const promises = cardIds.map(async (id) => {
        if (cardCache.has(id)) {
            updateProgress();
            return cardCache.get(id);
        }
        try {
            const result = await axios.get(`${API_BASE_URL}?id=${id}`);
            const card = result.data.data[0];
            cardCache.set(id, card);
            updateProgress();
            return card;
        } catch (error) {
            console.error(`Error loading card ${id}:`, error);
            updateProgress();
            return null;
        }
    });

    allCards = (await Promise.all(promises)).filter(card => card !== null);

    // Actualizar el contador de cartas permitidas
    try {
        const apiCardCountResponse = await axios.get(`${API_BASE_URL}?num=1&offset=0`);
        const allowedCards = apiCardCountResponse.data.meta.total_rows;
        document.getElementById('allowedCards').textContent = allowedCards;
    } catch (error) {
        console.error('Error fetching allowed card count:', error);
    }
}

function updateProgressBar(progress) {
    requestAnimationFrame(() => {
        document.getElementById('progressFill').style.width = `${progress}%`;
    });
}

function renderDeck() {
    ['main', 'extra', 'side'].forEach(section => {
        const sectionElement = document.getElementById(section + 'Deck');
        const gridElement = sectionElement.querySelector('.card-grid');
        gridElement.innerHTML = '';

        const cardCounts = new Map();
        currentDeck[section].forEach(cardId => {
            cardCounts.set(cardId, (cardCounts.get(cardId) || 0) + 1);
        });

        [...cardCounts.entries()].forEach(([cardId, count]) => {
            const card = allCards.find(c => c.id.toString() === cardId);
            if (card) {
                const cardElement = createCardElement(card, count, section);
                gridElement.appendChild(cardElement);
            }
        });

        updateCardCount(section);
    });
}

function createCardElement(card, count, section) {
    const cardElement = document.createElement('div');
    cardElement.className = `card-slot filled ${getCardType(card)}`;
    cardElement.style.backgroundImage = `url(${card.card_images[0].image_url_small})`;
    cardElement.dataset.cardId = card.id;
    cardElement.dataset.cardCount = count;
    cardElement.dataset.section = section;

    const countElement = document.createElement('div');
    countElement.className = 'card-count';
    countElement.textContent = count > 1 ? count : '';
    cardElement.appendChild(countElement);

    cardElement.addEventListener('click', () => showCardPreview(card));

    return cardElement;
}

function updateCardCount(section) {
    const count = currentDeck[section].length;
    const maxCount = section === 'main' ? 60 : 15;
    document.getElementById(`${section}Count`).textContent = `${count}/${maxCount}`;
}

function showCardPreview(card) {
    const previewElement = document.getElementById('cardPreview');
    previewElement.innerHTML = `
        <img src="${card.card_images[0].image_url}" alt="${card.name}" loading="lazy">
        <h3>${card.name}</h3>
        <p><strong>Tipo:</strong> ${card.type}</p>
        <p><strong>Atributo:</strong> ${card.attribute || 'N/A'}</p>
        <p><strong>Nivel/Rango:</strong> ${card.level || card.rank || 'N/A'}</p>
        <p><strong>ATK/DEF:</strong> ${card.atk || '?'} / ${card.def || '?'}</p>
        <p><strong>Descripción:</strong> ${card.desc}</p>
    `;
}

function getCardType(card) {
    if (card.type.includes('Fusion') || card.type.includes('Synchro') || card.type.includes('XYZ') || card.type.includes('Link')) {
        return 'extra';
    } else if (card.type.includes('Monster')) {
        return 'monster';
    } else if (card.type.includes('Spell')) {
        return 'spell';
    } else if (card.type.includes('Trap')) {
        return 'trap';
    }
    return 'other';
}

function exportDeck() {
    const output = document.getElementById('exportOutput');
    let exportText = "==Lista de cartas==\n{{RecetaDeck\n\n<!-- Deck Principal -->\n";

    currentDeck.main.forEach((cardId, index) => {
        const card = allCards.find(c => c.id.toString() === cardId);
        exportText += `|d${index + 1}=${card.name}\n`;
    });

    exportText += "\n<!-- Extra Deck -->\n";
    currentDeck.extra.forEach((cardId, index) => {
        const card = allCards.find(c => c.id.toString() === cardId);
        exportText += `|e${index + 1}=${card.name}\n`;
    });

    exportText += "\n<!-- Side Deck -->\n";
    currentDeck.side.forEach((cardId, index) => {
        const card = allCards.find(c => c.id.toString() === cardId);
        exportText += `|s${index + 1}=${card.name}\n`;
    });

    exportText += "}}\n";

    output.value = exportText;
    output.style.display = 'block';
    document.getElementById('copyButton').style.display = 'block';
    output.scrollIntoView({behavior: 'smooth'});
}

function copyToClipboard() {
    const output = document.getElementById('exportOutput');
    output.select();
    document.execCommand('copy');
    alert('Deck copiado al portapapeles');
}

function clearDeck() {
    currentDeck = { main: [], extra: [], side: [] };
    allCards = [];
    renderDeck();
    document.getElementById('exportButton').disabled = true;
    document.getElementById('copyButton').style.display = 'none';
    const exportOutput = document.getElementById('exportOutput');
    exportOutput.style.display = 'none';
    exportOutput.value = '';
    document.getElementById('cardPreview').innerHTML = '<h3>Vista previa de la carta</h3><p>Selecciona una carta para ver sus detalles aquí.</p>';
    document.getElementById('progressFill').style.width = '0%';
}

document.addEventListener('DOMContentLoaded', () => {
    // Precarga de imágenes comunes
    const commonImages = [
        'path/to/common/image1.jpg',
        'path/to/common/image2.jpg'
        // Agrega más imágenes comunes aquí
    ];
    commonImages.forEach(src => {
        const img = new Image();
        img.src = src;
    });

    // Uso de IntersectionObserver para carga perezosa
    if ('IntersectionObserver' in window) {
        const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    observer.unobserve(img);
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            lazyLoadObserver.observe(img);
        });
    }
});