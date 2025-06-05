const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const { promisify } = require('util');
const { exec: originalExec } = require('child_process');
const exec = promisify(originalExec);

// 配置参数
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '9afa0f97-643e-4c22-8156-dfa49bfcd88b';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || '';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'NodeJS-Sub';

// 内存存储
const memoryStore = {
  subData: '',
  ispInfo: 'Unknown-ISP' // 默认ISP信息
};

// 根路由
app.get("/", (req, res) => {
  res.send("Hello world!");
});

// 获取ISP信息的替代方案（纯Node.js实现）
async function fetchISPInfo() {
  try {
    // 使用axios替代curl获取IP信息
    const response = await axios.get('https://ifconfig.me/all.json');
    const { ip, country } = response.data;
    memoryStore.ispInfo = `${country || 'Unknown'}-${ip || 'Unknown'}`;
  } catch (err) {
    console.error('Failed to fetch ISP info:', err.message);
    // 使用备用方案 - 从请求头获取有限信息
    memoryStore.ispInfo = `Unknown-${os.hostname()}`;
  }
}

// 生成订阅内容
function generateSubContent() {
  const VMESS = { 
    v: '2', 
    ps: `${NAME}-${memoryStore.ispInfo}`, 
    add: CFIP || ARGO_DOMAIN || 'localhost', 
    port: CFPORT, 
    id: UUID, 
    aid: '0', 
    scy: 'none', 
    net: 'ws', 
    type: 'none', 
    host: ARGO_DOMAIN || 'localhost', 
    path: '/vmess-argo?ed=2560', 
    tls: ARGO_DOMAIN ? 'tls' : 'none', 
    sni: ARGO_DOMAIN || '', 
    alpn: '' 
  };

  memoryStore.subData = `
vless://${UUID}@${CFIP || ARGO_DOMAIN || 'localhost'}:${CFPORT}?encryption=none&security=${ARGO_DOMAIN ? 'tls' : 'none'}&sni=${ARGO_DOMAIN || ''}&type=ws&host=${ARGO_DOMAIN || 'localhost'}&path=%2Fvless-argo%3Fed%3D2560#${NAME}-${memoryStore.ispInfo}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP || ARGO_DOMAIN || 'localhost'}:${CFPORT}?security=${ARGO_DOMAIN ? 'tls' : 'none'}&sni=${ARGO_DOMAIN || ''}&type=ws&host=${ARGO_DOMAIN || 'localhost'}&path=%2Ftrojan-argo%3Fed%3D2560#${NAME}-${memoryStore.ispInfo}`;
}

// 订阅路由
app.get(`/${SUB_PATH}`, (req, res) => {
  if (!memoryStore.subData) {
    return res.status(503).send('Service Initializing');
  }
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(Buffer.from(memoryStore.subData).toString('base64'));
});

// 上传节点信息
async function uploadNodes() {
  if (!UPLOAD_URL) return;

  try {
    if (PROJECT_URL) {
      await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, {
        subscription: [`${PROJECT_URL}/${SUB_PATH}`]
      }, { headers: { 'Content-Type': 'application/json' } });
      console.log('Subscription uploaded successfully');
    } else if (memoryStore.subData) {
      const nodes = memoryStore.subData.split('\n')
        .filter(line => /(vless|vmess|trojan):\/\//.test(line));
      
      if (nodes.length > 0) {
        await axios.post(`${UPLOAD_URL}/api/add-nodes`, 
          { nodes }, 
          { headers: { 'Content-Type': 'application/json' } });
        console.log('Nodes uploaded successfully');
      }
    }
  } catch (err) {
    console.error('Upload failed:', err.message);
  }
}

// 设置自动保活
async function setupAutoAccess() {
  if (!AUTO_ACCESS || !PROJECT_URL) return;

  try {
    await axios.post('https://oooo.serv00.net/add-url', { 
      url: PROJECT_URL 
    });
    console.log('Auto access task added');
  } catch (err) {
    console.error('Auto access setup failed:', err.message);
  }
}

// 初始化服务
async function initialize() {
  console.log('Initializing service...');
  
  // 1. 获取ISP信息
  await fetchISPInfo();
  
  // 2. 生成订阅内容
  generateSubContent();
  console.log('Subscription content ready');
  
  // 3. 上传节点
  await uploadNodes();
  
  // 4. 设置自动保活
  await setupAutoAccess();
  
  console.log('Service initialized');
}

// 启动HTTP服务
app.listen(PORT, () => {
  console.log(`HTTP server running on port:${PORT}`);
  initialize().catch(err => {
    console.error('Initialization error:', err);
  });
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    memoryUsage: process.memoryUsage(), 
    uptime: process.uptime() 
  });
});
