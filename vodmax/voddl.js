WidgetMetadata = {
    id: "universal_stream_ultimate",
    title: "全能播放源 | 全球通杀",
    author: "MakkaPakka",
    description: "聚合国内采集站与海外华人站。非凡/量子/欧乐/独播库/韩剧看看/Libvio/AGE。",
    version: "5.0.0",
    requiredVersion: "0.0.1",
    
    // 1. 全局设置：网络环境
    globalParams: [
        {
            name: "networkMode",
            title: "网络环境",
            type: "enumeration",
            value: "auto",
            enumOptions: [
                { title: "🚀 自动全搜 (所有源)", value: "auto" },
                { title: "🇨🇳 国内直连 (仅国内源)", value: "cn_only" },
                { title: "🌍 国际线路 (仅海外源)", value: "global_only" }
            ]
        }
    ],

    modules: [
        {
            id: "loadResource",
            title: "加载资源",
            functionName: "loadResource",
            type: "stream",
            params: [] 
        }
    ]
};

// ==========================================
// 1. 核心分发逻辑
// ==========================================

async function loadResource(params) {
    // Forward 注入参数
    const { seriesName, type = 'tv', season, episode, title, networkMode = "auto" } = params;
    
    let queryName = seriesName || title;
    let queries = [queryName];
    if (season && season > 1) {
        queries.push(`${queryName} 第${season}季`);
        queries.push(`${queryName} ${season}`);
    }

    console.log(`[UniversalStream] Mode: ${networkMode}, Searching: ${queries[0]}`);

    const tasks = [];

    // --- A. 国内源 (CN) ---
    // 适合：非凡/量子/Libvio/AGE
    if (networkMode === "auto" || networkMode === "cn_only") {
        // VOD CMS (极速)
        tasks.push(searchVodCms(queryName, season, episode));
        // 精品站 (画质)
        tasks.push(searchLibvio(queryName, season, episode));
        // 动漫
        tasks.push(searchAge(queryName, season, episode));
    }

    // --- B. 国际源 (Global) ---
    // 适合：欧乐/独播库/韩剧看看
    if (networkMode === "auto" || networkMode === "global_only") {
        tasks.push(searchOlevod(queryName, season, episode));
        tasks.push(searchDuboku(queryName, season, episode));
        tasks.push(searchHjkk(queryName, season, episode));
    }

    const results = await Promise.all(tasks);
    
    // 扁平化 + 去重
    const flatResults = results.flat().filter(item => item && item.url);
    const uniqueMap = new Map();
    flatResults.forEach(item => {
        if (!uniqueMap.has(item.url)) {
            uniqueMap.set(item.url, item);
        }
    });

    return Array.from(uniqueMap.values());
}

// ==========================================
// 2. 国内源实现 (CN Sources)
// ==========================================

// 2.1 VOD CMS (非凡/量子)
const CMS_SITES = [
    { name: "非凡", url: "http://cj.ffzyapi.com/api.php/provide/vod/" },
    { name: "量子", url: "https://cj.lziapi.com/api.php/provide/vod/" }
];

async function searchVodCms(keyword, season, episode) {
    const tasks = CMS_SITES.map(async (site) => {
        try {
            const res = await Widget.http.get(`${site.url}?ac=detail&wd=${encodeURIComponent(keyword)}`);
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            if (!data?.list) return [];

            let resources = [];
            data.list.forEach(item => {
                const episodes = item.vod_play_url.split("#");
                const targetEp = episode ? episode.toString() : "1";
                
                episodes.forEach(epStr => {
                    const [epName, epLink] = epStr.split("$");
                    if (season) {
                        const num = epName.match(/\d+/);
                        if (num && parseInt(num[0]) == targetEp) {
                            resources.push({ name: `${site.name} (直连)`, description: `${item.vod_name} [${epName}]`, url: epLink });
                        }
                    } else {
                        resources.push({ name: `${site.name} (直连)`, description: `${item.vod_name}`, url: epLink });
                    }
                });
            });
            return resources;
        } catch (e) { return []; }
    });
    return (await Promise.all(tasks)).flat();
}

// 2.2 Libvio
const LIB_URL = "https://libvio.app";
async function searchLibvio(keyword, season, episode) {
    try {
        const res = await Widget.http.get(`${LIB_URL}/search/-------------.html?wd=${encodeURIComponent(keyword)}`);
        const $ = Widget.html.load(res.data);
        let detailUrl = "";
        $(".stui-vodlist__thumb").each((i, el) => {
            if ($(el).attr("title").includes(keyword)) { detailUrl = $(el).attr("href"); return false; }
        });
        if (!detailUrl) return [];

        const res2 = await Widget.http.get(`${LIB_URL}${detailUrl}`);
        const $2 = Widget.html.load(res2.data);
        const targetEp = episode ? episode.toString() : "1";
        let playUrl = "";
        
        $2(".stui-content__playlist a").each((i, el) => {
            const text = $2(el).text();
            if (!season) { playUrl = $2(el).attr("href"); return false; }
            const num = text.match(/\d+/);
            if (num && parseInt(num[0]) == targetEp) { playUrl = $2(el).attr("href"); return false; }
        });

        if (!playUrl) return [];
        const res3 = await Widget.http.get(`${LIB_URL}${playUrl}`);
        const match = res3.data.match(/"url":"([^"]+)"/);
        if (match) return [{ name: "Libvio (蓝光)", description: "极速秒播", url: match[1], headers: { "Referer": LIB_URL } }];
    } catch (e) {}
    return [];
}

// 2.3 AGE动漫
const AGE_URL = "https://www.agemys.net";
async function searchAge(keyword, season, episode) {
    // AGE 解析复杂，暂留空或仅作 Webview 跳转，此处略过以保证直连纯净性
    return [];
}

// ==========================================
// 3. 国际源实现 (Global Sources)
// ==========================================

// 3.1 欧乐 (Olevod)
const OLE_URL = "https://www.olevod.com";
async function searchOlevod(keyword, season, episode) {
    try {
        const res = await Widget.http.get(`${OLE_URL}/index.php/vod/search.html?wd=${encodeURIComponent(keyword)}`);
        const $ = Widget.html.load(res.data);
        let detailUrl = "";
        $(".module-search-item").each((i, el) => {
            const title = $(el).find("h3 a").text();
            if (title.includes(keyword)) { detailUrl = $(el).find("h3 a").attr("href"); return false; }
        });
        if (!detailUrl) return [];

        const res2 = await Widget.http.get(`${OLE_URL}${detailUrl}`);
        const $2 = Widget.html.load(res2.data);
        let playUrl = "";
        const targetEp = episode ? episode.toString() : "1";

        $2(".module-play-list-content a").each((i, el) => {
            const text = $2(el).text();
            if (!season) { playUrl = $2(el).attr("href"); return false; }
            const num = text.match(/\d+/);
            if (num && parseInt(num[0]) == targetEp) { playUrl = $2(el).attr("href"); return false; }
        });

        if (!playUrl) return [];
        const res3 = await Widget.http.get(`${OLE_URL}${playUrl}`);
        const match = res3.data.match(/"url":"([^"]+)"/);
        if (match) return [{ name: "欧乐 (国际)", description: "海外直连", url: match[1].replace(/\\/g, ""), headers: { "Referer": OLE_URL } }];
    } catch (e) {}
    return [];
}

// 3.2 独播库 (Duboku)
const DUBOKU_URL = "https://www.duboku.tv";
async function searchDuboku(keyword, season, episode) {
    try {
        const res = await Widget.http.get(`${DUBOKU_URL}/vod/search.html?wd=${encodeURIComponent(keyword)}`);
        const $ = Widget.html.load(res.data);
        let detailUrl = "";
        $(".module-item").each((i, el) => {
            if ($(el).find(".module-item-title").text().includes(keyword)) { detailUrl = $(el).find("a").attr("href"); return false; }
        });
        if (!detailUrl) return [];

        const res2 = await Widget.http.get(`${DUBOKU_URL}${detailUrl}`);
        const $2 = Widget.html.load(res2.data);
        let playUrl = "";
        const targetEp = episode ? episode.toString() : "1";

        $2(".module-play-list-content a").each((i, el) => {
            const text = $2(el).text();
            if (!season) { playUrl = $2(el).attr("href"); return false; }
            const num = text.match(/\d+/);
            if (num && parseInt(num[0]) == targetEp) { playUrl = $2(el).attr("href"); return false; }
        });

        if (!playUrl) return [];
        const res3 = await Widget.http.get(`${DUBOKU_URL}${playUrl}`);
        const match = res3.data.match(/"url":"([^"]+)"/);
        if (match) return [{ name: "独播库 (国际)", description: "海外直连", url: match[1].replace(/\\/g, ""), headers: { "Referer": DUBOKU_URL } }];
    } catch (e) {}
    return [];
}

// 3.3 韩剧看看 (Hjkk)
const HJKK_URL = "https://www.hanjukankan.com";
async function searchHjkk(keyword, season, episode) {
    try {
        const res = await Widget.http.get(`${HJKK_URL}/hanju/search.html?wd=${encodeURIComponent(keyword)}`);
        const $ = Widget.html.load(res.data);
        let detailUrl = "";
        $(".module-search-item").each((i, el) => {
            if ($(el).find(".video-serial").attr("title").includes(keyword)) { detailUrl = $(el).find(".video-serial").attr("href"); return false; }
        });
        if (!detailUrl) return [];

        const res2 = await Widget.http.get(`${HJKK_URL}${detailUrl}`);
        const $2 = Widget.html.load(res2.data);
        let playUrl = "";
        const targetEp = episode ? episode.toString() : "1";

        $2(".module-play-list-content a").each((i, el) => {
            const text = $2(el).text();
            if (!season) { playUrl = $2(el).attr("href"); return false; }
            const num = text.match(/\d+/);
            if (num && parseInt(num[0]) == targetEp) { playUrl = $2(el).attr("href"); return false; }
        });

        if (!playUrl) return [];
        const res3 = await Widget.http.get(`${HJKK_URL}${playUrl}`);
        const match = res3.data.match(/"url":"([^"]+)"/);
        if (match) return [{ name: "韩剧看看 (国际)", description: "海外直连", url: match[1].replace(/\\/g, ""), headers: { "Referer": HJKK_URL } }];
    } catch (e) {}
    return [];
}
