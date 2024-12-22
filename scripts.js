const API_BASE_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const STATS_API_URL = 'https://right-burnt-approach.glitch.me/stats';
const WS_URL = 'wss://right-burnt-approach.glitch.me';

let currentDeck = { main: [], extra: [], side: [] };
let allCards = [];
let cardCache = new Map();

// Configurar eventos de los botones y el input de archivo
document.getElementById('fileInput').addEventListener('change', handleFileUpload);
document.getElementById('exportButton').addEventListener('click', exportDeck);
document.getElementById('copyButton').addEventListener('click', copyToClipboard);
document.getElementById('exportToWikiButton').addEventListener('click', exportToWiki);
document.getElementById('fileInput').addEventListener('click', () => {
    document.getElementById('fileInput').value = null;
    clearDeck();
});

// Habilitar el botón "Exportar a Wiki" solo si el campo "Nombre del Deck" está lleno
document.getElementById('nombreDeck').addEventListener('input', function () {
    const deckName = document.getElementById('nombreDeck').value.trim();
    document.getElementById('exportToWikiButton').disabled = deckName === '';
});

// Conectar al servidor WebSocket
const ws = new WebSocket(WS_URL);

ws.onopen = () => {
    console.log('WebSocket connection established');
};

ws.onmessage = (event) => {
    const stats = JSON.parse(event.data);
    if (stats.error) {
        console.error('Error from WebSocket:', stats.error);
    } else {
        updateStatisticsDisplay(stats);
    }
};

ws.onclose = () => {
    console.log('WebSocket connection closed');
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

// Cargar y actualizar estadísticas
loadStatistics();

// Función para cargar estadísticas
async function loadStatistics() {
    try {
        const response = await axios.get(STATS_API_URL);
        const stats = response.data;
        updateStatisticsDisplay(stats);
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Función para actualizar la visualización de estadísticas
function updateStatisticsDisplay(stats) {
    document.getElementById('visitCount').textContent = stats.visitCount;
    document.getElementById('deckCount').textContent = stats.deckCount;
    document.getElementById('averageTime').textContent = stats.averageTime.toFixed(2) + 's';
}

// Manejar la carga de archivos
async function handleFileUpload(e) {
    const startTime = performance.now();
    const file = e.target.files[0];
    const content = await file.text();

    clearDeck();

    try {
        currentDeck = parseDeck(content);
        await loadAllCards();
        renderDeck();
        updateProgressBar(100);

        document.getElementById('exportButton').disabled = false;

        // Actualizar estadísticas
        let response = await axios.get(STATS_API_URL);
        let stats = response.data;
        stats.deckCount++;
        const endTime = performance.now();
        const conversionTime = (endTime - startTime) / 1000; // en segundos
        stats.averageTime = (stats.averageTime * (stats.deckCount - 1) + conversionTime) / stats.deckCount;
        stats.lastUpdated = new Date().toISOString();

        await updateStatistics(stats);

        showNotification('success', 'Deck cargado y convertido con éxito.');
    } catch (error) {
        showNotification('error', 'Error: ' + error.message);
    }
}

// Función para analizar el contenido del deck
function parseDeck(content) {
    const lines = content.split('\n');
    const deck = { main: [], extra: [], side: [] };
    let currentSection = null;

    for (const line of lines) {
        if (line.startsWith('#main')) currentSection = 'main';
        else if (line.startsWith('#extra')) currentSection = 'extra';
        else if (line.startsWith('!side')) currentSection = 'side';
        else if (line.trim() && !line.startsWith('#')) {
            if (currentSection) deck[currentSection].push(line.trim());
        }
    }

    if (deck.main.length === 0 && deck.extra.length === 0) {
        throw new Error('El archivo no contiene un deck válido.');
    }

    return deck;
}

// Función para cargar todas las cartas
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
}

// Función para actualizar la barra de progreso
function updateProgressBar(progress) {
    document.getElementById('progressFill').style.width = `${progress}%`;
}

// Función para renderizar el deck en la página
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

// Función para crear un elemento de carta
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

// Función para actualizar el contador de cartas
function updateCardCount(section) {
    const count = currentDeck[section].length;
    const maxCount = section === 'main' ? 60 : 15;
    document.getElementById(`${section}Count`).textContent = `${count}/${maxCount}`;
}

// Función para mostrar la vista previa de una carta
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

// Función para obtener el tipo de carta
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

// Función para exportar el deck
function exportDeck() {
    const formData = new FormData(document.getElementById('deckInfoForm'));
    const deckInfo = Object.fromEntries(formData.entries());

    if (!validateForm(deckInfo)) return;

    const output = document.getElementById('exportOutput');
    const fechaPublicacion = new Date(deckInfo.fecha_publicacion) || new Date();
    const formattedDate = `${fechaPublicacion.getUTCDate().toString().padStart(2, '0')}/${(fechaPublicacion.getUTCMonth() + 1).toString().padStart(2, '0')}/${fechaPublicacion.getUTCFullYear()}`;

    let exportText = `{{InfoDeck
|autor=${deckInfo.autor}
|carta=${deckInfo.carta}
|atributo=${deckInfo.atributo}
|atributo2=${deckInfo.atributo2}
|tipo=${deckInfo.tipo}
|tipo2=${deckInfo.tipo2}
|arquetipo=${deckInfo.arquetipo}
|arquetipo2=${deckInfo.arquetipo2}
|arquetipo3=${deckInfo.arquetipo3}
|estrategia=${deckInfo.estrategia}
|fecha publicación=${formattedDate}
}}

==Lista de cartas==
{{RecetaDeck

<!-- Deck Principal -->\n`;

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

    exportText += `}}

==Comentario del autor==
${deckInfo.comentario}
`;

    output.value = exportText;
    output.style.display = 'block';
    document.getElementById('copyButton').style.display = 'block';
    document.getElementById('exportToWikiButton').style.display = 'block';
    document.getElementById('exportToWikiButton').disabled = deckInfo.nombreDeck.trim() === '';
    output.scrollIntoView({ behavior: 'smooth' });
}

// Función para copiar el texto exportado al portapapeles
function copyToClipboard() {
    const output = document.getElementById('exportOutput');

    try {
        // Seleccionar el contenido del textarea
        output.select();
        output.setSelectionRange(0, output.value.length); // Para navegadores más antiguos

        // Copiar el contenido al portapapeles
        document.execCommand('copy');

        // Mostrar notificación de éxito
        showNotification('success', 'Deck copiado al portapapeles');
    } catch (error) {
        console.error('Error al copiar al portapapeles:', error);
        showNotification('error', 'Error al copiar al portapapeles');
    }
}

// Función para limpiar el deck
function clearDeck() {
    currentDeck = { main: [], extra: [], side: [] };
    allCards = [];
    renderDeck();
    document.getElementById('exportButton').disabled = true;
    document.getElementById('exportToWikiButton').style.display = 'none';
    document.getElementById('copyButton').style.display = 'none';
    const exportOutput = document.getElementById('exportOutput');
    exportOutput.style.display = 'none';
    exportOutput.value = '';
    document.getElementById('cardPreview').innerHTML = '<h3>Vista previa de la carta</h3><p>Selecciona una carta para ver sus detalles aquí.</p>';
    document.getElementById('progressFill').style.width = '0%';
}

// Función para exportar el contenido del deck a la wiki
function exportToWiki() {
    const deckName = document.getElementById('nombreDeck').value.trim();

    if (deckName) {
        const output = document.getElementById('exportOutput');

        // Seleccionar el contenido del textarea
        output.select();
        output.setSelectionRange(0, output.value.length); // Para navegadores más antiguos

        // Copiar el contenido al portapapeles
        document.execCommand('copy');

        // Mostrar notificación de éxito
        showNotification('success', 'Deck copiado al portapapeles');

        // Abrir el enlace en una nueva pestaña
        const wikiUrl = `https://yugiohdecks.fandom.com/es/index.php?action=edit&preload=Plantilla%3ANuevaReceta&title=${encodeURIComponent(deckName)}&create=Crear&section=1`;
        window.open(wikiUrl, '_blank');
    } else {
        showNotification('error', 'Por favor, ingrese un nombre de deck.');
    }
}

// Función para validar el formulario antes de exportar
function validateForm(deckInfo) {
    const requiredFields = ['nombreDeck', 'autor', 'carta', 'estrategia', 'fecha_publicacion'];
    const missingFields = requiredFields.filter(field => !deckInfo[field]);

    if (missingFields.length > 0) {
        showNotification('error', `Faltan los siguientes campos: ${missingFields.join(', ')}`);
        return false;
    }

    return true;
}

// Función para mostrar notificaciones
function showNotification(type, message) {
    const notificationContainer = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationContainer.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Función para actualizar estadísticas en el servidor
async function updateStatistics(stats) {
    try {
        await axios.post(STATS_API_URL, stats);
        ws.send(JSON.stringify(stats));
    } catch (error) {
        console.error('Error updating statistics:', error);
    }
}

// Cargar estadísticas al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    loadStatistics();
});