const tg = window.Telegram.WebApp;
tg.expand();
tg.headerColor = '#0f0f12';

// Твой АКТУАЛЬНЫЙ URL Google App Script (обновлен)
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwXMUUjIExDfux0C2IkzJTmcZ7K5aj1R4znn40Z9HzWHWAR2pdupsZnDgFqBvIgOsiGQw/exec";

let html5QrCode;
let currentBox = "";
let count = 0;
let sessionCodes = new Set();

// Функция управления коробкой (Сессией)
function toggleBox() {
    const btn = document.getElementById('boxBtn');
    const card = document.getElementById('card');
    const display = document.getElementById('boxDisplay');

    if (!currentBox) {
        // Открытие новой коробки
        currentBox = "BOX-" + Math.floor(Date.now() / 1000).toString().slice(-5);
        count = 0;
        sessionCodes.clear();
        display.innerText = currentBox;
        display.style.color = "var(--accent)";
        document.getElementById('boxCount').innerText = "Сканирований: 0";
        btn.innerText = "🛑 ЗАКРЫТЬ КОРОБКУ";
        btn.className = "btn btn-stop";
        card.classList.add('pulse-active');
        startCamera();
    } else {
        // Закрытие текущей коробки через подтверждение
        tg.showConfirm(`Завершить коробку ${currentBox}?`, (ok) => {
            if (ok) {
                currentBox = "";
                display.innerText = "ЗАВЕРШЕНА";
                display.style.color = "var(--primary)";
                btn.innerText = "📦 ОТКРЫТЬ НОВУЮ";
                btn.className = "btn btn-box";
                card.classList.remove('pulse-active');
                stopCamera();
            }
        });
    }
}

// Запуск камеры (только Data Matrix)
function startCamera() {
    const reader = document.getElementById('reader');
    reader.style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    
    const config = { 
        fps: 24, 
        qrbox: 250, 
        formatsToSupport: [Html5QrcodeSupportedFormats.DATA_MATRIX] 
    };

    html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        (code) => processCode(code)
    ).catch(err => {
        console.error("Ошибка камеры:", err);
        document.getElementById('status').innerText = "Ошибка доступа к камере";
    });
}

// Остановка камеры
function stopCamera() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => { 
            document.getElementById('reader').style.display = 'none'; 
        });
    }
}

// Обработка отсканированного кода
async function processCode(code) {
    const statusDiv = document.getElementById('status');
    
    // Проверка на дубликат в рамках текущей сессии
    if (sessionCodes.has(code)) {
        tg.HapticFeedback.notificationOccurred('error');
        statusDiv.innerText = "⚠️ ЭТОТ КОД УЖЕ ЕСТЬ!";
        statusDiv.style.color = "var(--danger)";
        return;
    }

    // Визуальное и тактильное подтверждение скана
    sessionCodes.add(code);
    count++;
    document.getElementById('boxCount').innerText = `Сканирований: ${count}`;
    tg.HapticFeedback.impactOccurred('medium');
    statusDiv.innerText = "⌛ Отправка...";
    statusDiv.style.color = "var(--primary)";
    
    // Логирование в интерфейсе
    const log = document.getElementById('log');
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    log.innerHTML = `<div class="log-row"><span>[${time}]</span> <span>${code.substring(0,18)}...</span></div>` + log.innerHTML;

    // Отправка данных на сервер
    try {
        const response = await fetch(WEB_APP_URL, {
            method: "POST",
            body: JSON.stringify({
                userId: String(tg.initDataUnsafe?.user?.id),
                userName: tg.initDataUnsafe?.user?.username || "Guest",
                code: code,
                sessionId: currentBox
            })
        });

        const result = await response.text();

        if (result === "LIMIT_REACHED") {
            handleLimitReached();
        } else if (result === "OK") {
            statusDiv.innerText = "✅ Принято сервером";
            statusDiv.style.color = "var(--accent)";
        }
    } catch (err) {
        console.error("Ошибка сети:", err);
        statusDiv.innerText = "📡 Ошибка сети (сохранено локально)";
    }
}

// Логика при достижении лимита
function handleLimitReached() {
    stopCamera();
    tg.HapticFeedback.notificationOccurred('warning');
    
    tg.showPopup({
        title: 'Лимит достигнут',
        message: 'Вы использовали все доступные сканы в демо-режиме. Хотите перейти на безлимитную версию PRO?',
        buttons: [
            {id: 'buy', type: 'default', text: 'Узнать цену'},
            {id: 'cancel', type: 'destructive', text: 'Позже'}
        ]
    }, (buttonId) => {
        if (buttonId === 'buy') {
            tg.sendData("CONTACT_REDEEM_PRO"); // Отправляем сигнал боту
            tg.close();
        } else {
            tg.close();
        }
    });
}

// Экспорт данных в Excel/CSV
async function exportData() {
    const statusDiv = document.getElementById('status');
    statusDiv.innerText = "⌛ Формирую отчет...";
    
    try {
        const userId = tg.initDataUnsafe?.user?.id;
        // Добавляем параметр command=export, чтобы App Script понял, что это экспорт
        await fetch(`${WEB_APP_URL}?userId=${userId}&command=export`);
        tg.showAlert("📊 Отчет готов! Проверьте чат с ботом.");
        statusDiv.innerText = "✅ Отправлено";
    } catch (err) {
        tg.showAlert("Ошибка при выгрузке данных.");
    }
}
