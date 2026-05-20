const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip'); // Библиотека для ZIP

const app = express();
const db = new sqlite3.Database('./database.db');

app.use(bodyParser.json());
app.use(express.static('public'));

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS sites (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, domain TEXT, data TEXT)");
});

// --- АВТОРИЗАЦИЯ ---
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Заполните все поля" });

    db.run("INSERT INTO users (email, password) VALUES (?, ?)", [email, password], function(err) {
        if (err) return res.status(400).json({ error: "Этот Email уже зарегистрирован" });
        res.json({ success: true });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, user) => {
        if (err) return res.status(500).json({ error: "Ошибка БД" });
        if (user) {
            res.json({ success: true, userId: user.id });
        } else {
            res.status(401).json({ error: "Неверный Email или пароль" });
        }
    });
});

// --- ГЕНЕРАЦИЯ И СКАЧИВАНИЕ ---
app.post('/api/generate', (req, res) => {
    const { userId, domain, siteData } = req.body;

    db.run("INSERT INTO sites (user_id, domain, data) VALUES (?, ?, ?)", [userId, domain, JSON.stringify(siteData)], function(err) {
        if (err) return res.status(500).json({ error: "Ошибка БД" });
        
        const exportDir = path.join(__dirname, 'exports', domain);
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

        const nav = `
            <a href="index.html">Главная</a> | 
            <a href="about.html">${siteData.labels.l1}</a> | 
            <a href="portfolio.html">${siteData.labels.l2}</a> | 
            <a href="services.html">${siteData.labels.l3}</a> | 
            <a href="contact.html">${siteData.labels.l4}</a>`;

        const generateHTML = (title, content) => `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
	    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | ${siteData.name}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <nav>${nav}</nav>
    <div class="content"><h1>${title}</h1><div>${content}</div></div>
    <footer><p>© 2026 ${siteData.name}.</p></footer>
</body>
</html>`;

        const pages = {
            'index.html': { title: 'Главная', content: `<p>${siteData.content.main}</p>` },
            'about.html': { title: siteData.labels.l1, content: `<p>${siteData.content.about}</p>` },
            'portfolio.html': { title: siteData.labels.l2, content: `<p>${siteData.content.portfolio}</p>` },
            'services.html': { title: siteData.labels.l3, content: `<p>${siteData.content.services}</p>` },
            'contact.html': { title: siteData.labels.l4, content: `<p>Тел: ${siteData.content.contacts.phone}<br>Email: ${siteData.content.contacts.email}</p>` }
        };

        for (const [fileName, page] of Object.entries(pages)) {
            fs.writeFileSync(path.join(exportDir, fileName), generateHTML(page.title, page.content));
        }

        const css = `body{font-family:sans-serif;margin:0;background:#f4f4f4} nav{background:#2c3e50;padding:20px;text-align:center} nav a{color:white;margin:0 15px;text-decoration:none;font-weight:bold} .content{max-width:800px;margin:30px auto;background:white;padding:40px;border-radius:10px;min-height:400px} h1{color:#2c3e50;border-bottom:3px solid #3498db} footer{text-align:center;color:#888;padding:20px}`;
        fs.writeFileSync(path.join(exportDir, 'style.css'), css);

        // --- СОЗДАНИЕ ZIP АРХИВА ---
        const zip = new AdmZip();
        zip.addLocalFolder(exportDir);
        const zipName = `${domain}.zip`;
        const zipPath = path.join(__dirname, 'exports', zipName);
        zip.writeZip(zipPath);

        res.json({ success: true, domain: domain });
    });
});

// Эндпоинт для скачивания архива
app.get('/api/download/:domain', (req, res) => {
    const filePath = path.join(__dirname, 'exports', `${req.params.domain}.zip`);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send("Файл не найден");
    }
});

app.listen(3000, () => console.log('BobbyHost: http://localhost:3000'));
