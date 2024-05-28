// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 8080;

// 데이터 파일을 저장할 기본 폴더
app.use(express.static('maps')); // 정적 파일 제공
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.urlencoded({ extended: true })); // 폼 데이터를 해석하기 위해
const BASE_DATA_PATH = path.join(__dirname, 'data');

//소켓 통신 관련
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json({
    limit : "50mb"
}));
app.use(express.urlencoded({
    limit:"50mb",
    extended: false
}));


function ensureDataFolderExists(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}


// multer 설정
const svgstorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const mapId = req.params.mapId;
        const mapPath = path.join(BASE_DATA_PATH, mapId);
        if (!fs.existsSync(mapPath)) {
            fs.mkdirSync(mapPath, { recursive: true });
        }
        cb(null, mapPath);
    },
    filename: (req, file, cb) => {
        cb(null, 'map.svg');
    }
});
// multer 설정
const imgstorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const mapId = req.params.mapId;
        const mapPath = path.join(BASE_DATA_PATH, mapId);
        if (!fs.existsSync(mapPath)) {
            fs.mkdirSync(mapPath, { recursive: true });
        }
    },
    filename: (req, file, cb) => {
        const areaId = req.params.areaId;
        cb(null, areaId + '.jpg');
    }
});

const svgupload = multer({ storage: svgstorage });
const imgupload = multer({ storage: imgstorage,
    limits: { fileSize: 50 * 1024 * 1024 }  });

// 맵 추가 페이지
app.get('/addmap', (req, res) => {
    res.send(`
        <h1>새 맵 추가</h1>
        <form action="/addmap" method="post">
            <label for="mapName">맵 이름:</label>
            <input type="text" id="mapName" name="mapName" required><br><br>
            <input type="submit" value="맵 추가">ƒ
        </form>
    `);
});
// 맵 추가 처리
app.post('/addmap', (req, res) => {
    const mapName = req.body.mapName;
    const mapPath = path.join(BASE_DATA_PATH, mapName);
    if (!fs.existsSync(mapPath)) {
        fs.mkdirSync(mapPath, { recursive: true });
        fs.writeFileSync(path.join(mapPath, 'crowdData.json'), '{}', 'utf8');
        fs.writeFileSync(path.join(mapPath, 'evacuation.json'), '{}', 'utf8');
        // HTML 파일 읽기 및 동적 처리
        fs.readFile(path.join(__dirname, 'html', 'mappage.html'), 'utf8', (err, data) => {
            if (err) {
                res.status(500).send('Error reading HTML file');
                return;
            }
            const updatedHtml = data.replaceAll('${mapName}', mapName);
            fs.writeFile(path.join('maps', `${mapName}.html`), updatedHtml, 'utf8', (err) => {
                if (err) {
                    res.status(500).send('Error writing HTML file');
                    return;
                }
                res.send(`맵 '${mapName}'이(가) 성공적으로 추가되었습니다. <a href="/">홈으로 돌아가기</a>`);
            });
        });
    } else {
        res.send(`맵 '${mapName}'은(는) 이미 존재합니다. <a href="/">홈으로 돌아가기</a>`);
    }
});


// 파일에 데이터 저장
function saveData(mapId, data) {
    const folderPath = path.join(BASE_DATA_PATH, mapId);
    ensureDataFolderExists(folderPath);
    const filePath = path.join(folderPath, 'crowdData.json');

    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Failed to write to data file for map ${mapId}:`, error);
    }
}


// 초기 페이지를 렌더링하는 라우트
app.get('/', (req, res) => {
    const maps = fs.readdirSync(BASE_DATA_PATH).filter(file => fs.statSync(path.join(BASE_DATA_PATH, file)).isDirectory());
    let html = '<h1>인구 밀도 알리미</h1>';
    html += '<a href="/addmap"><button>맵 추가</button></a><br><br>';
    maps.forEach(map => {
        html += `<p><a href="/map/${map}">${map}</a></p>`;
    });
    res.send(html);
});


// 맵 상세 페이지
app.get('/map/:mapId', (req, res) => {
    const mapId = req.params.mapId;
    // 맵 파일이 있다고 가정하고 링크 제공 (실제 파일 경로는 적절히 설정해야 함)
    res.sendFile(path.join(__dirname, 'maps', `${mapId}.html`));
});

// 군중 데이터 입력 페이지
app.get('/crowd-count/:mapId', (req, res) => {
    const mapId = req.params.mapId;
    res.send(`
        <h1>군중 수 입력 - ${mapId}</h1>
        <form action="/update-crowd/${mapId}" method="post">
            <label for="areaId">Area ID:</label>
            <input type="text" id="areaId" name="areaId"><br><br>
            <label for="crowdCount">crowdCount:</label>
            <input type="number" id="crowdCount" name="crowdCount"><br><br>
            <label for="area">구역 넓이:</label>
            <input type="number" id="area" name="area"><br><br>
            <input type="submit" value="Submit">
        </form>
    `);
});




// 군중 데이터를 받아서 저장
app.post('/update-crowd/:mapId', (req, res) => {
    console.log(req.body)
    const mapId = req.params.mapId;
    const { areaId, crowdCount, area } = req.body;
    const folderPath = path.join(BASE_DATA_PATH, mapId);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
    const filePath = path.join(folderPath, 'crowdData.json');
    let crowdData = {};
    if (fs.existsSync(filePath)) {
        crowdData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    crowdData[areaId] = crowdCount;

    
    const areaPath = path.join(folderPath, 'areaData.json');
    let areaData = {};
    if (fs.existsSync(areaPath)) {
        areaData = JSON.parse(fs.readFileSync(areaPath, 'utf8'));
    }
    if(!isNaN(area)){
        areaData[areaId] = area
    }
    fs.writeFileSync(filePath, JSON.stringify(crowdData, null, 2), 'utf8');
    fs.writeFileSync(areaPath, JSON.stringify(areaData, null, 2), 'utf8');
    res.send(`Data for ${mapId} updated successfully.`);
});

// 대피 경로 저장
app.post('/update-evacuation/:mapId', (req, res) => {
    const mapId = req.params.mapId;
    const { evacuationPaths } = req.body;
    const folderPath = path.join(BASE_DATA_PATH, mapId);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
    const filePath = path.join(folderPath, 'evacuation.json');
    fs.writeFileSync(filePath, JSON.stringify(evacuationPaths, null, 2), 'utf8');
    res.send(`Evacuation paths for ${mapId} updated successfully. <a href="/map/${mapId}">맵으로 돌아가기</a>`);
});

// 군중 데이터를 클라이언트에 제공
app.get('/crowd-data/:mapId', (req, res) => {
    const mapId = req.params.mapId;
    const crowdData = loadData(mapId);
    res.status(200).json(crowdData);
});

// 맵 SVG 파일 업로드
app.post('/upload-map/:mapId', svgupload.single('mapFile'), (req, res) => {
    const mapId = req.params.mapId;
    res.send(`맵 SVG 파일이 성공적으로 업로드되었습니다. <a href="/map/${mapId}">맵으로 돌아가기</a>`);
});


// 군중 사진 파일 업로드
app.post('/crowd-photo/:mapId/:areaId', imgupload.single('mapFile'), (req, res) => {
    const mapId = req.params.mapId;
    const areaId = req.params.areaId;
    console.log(mapId + ' ' + areaId)
    res.send(`맵 SVG 파일이 성공적으로 업로드되었습니다. <a href="/map/${mapId}">맵으로 돌아가기</a>`);
});


//사진 전송 순서를 설정
let order = Object.keys(require('data/경남과학고/crowdData.json'));
let noworder = 0


io.on('connection', (socket) => {
    console.log('a user connected');
    socket.emit('order', order);
    

    const imagePath = path.join('data/경남과학고/' + order[noworder] + '.jpg');
    imgData = Buffer.from(fs.readFileSync(imagePath)).toString('base64');
    socket.emit('image', imgData);

    socket.on('result', (data) => {
        console.log(data)
        const folderPath = path.join(BASE_DATA_PATH, '경남과학고');
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        const filePath = path.join(folderPath, 'crowdData.json');
        let crowdData = {};
        if (fs.existsSync(filePath)) {
            crowdData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        crowdData[data.areaId] = data.result;
        fs.writeFileSync(filePath, JSON.stringify(crowdData, null, 2), 'utf8');


        //다음 이미지 전송
        noworder += 1
        if(noworder == order.length){
            noworder = 0
        }
        const imagePath = path.join('data/경남과학고/' + Object.keys(areas)[noworder] + '.jpg');
        imgData = Buffer.from(fs.readFileSync(imagePath)).toString('base64');
        socket.emit('image', imgData);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});


// 서버 시작
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
