WidgetMetadata = {
    id: "universal_video_hub",
    title: "全能影视聚合",
    author: "MakkaPakka",
    description: "聚合 茶杯狐(全网搜)、Anime1(日漫)、厂长(4K)。一站式观影。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://cupfox.app",

    modules: [
        // 模块 1: 茶杯狐 (搜索聚合)
        {
            title: "全网搜片 (CupFox)",
            functionName: "loadCupFox",
            type: "video",
            params: [
                {
                    name: "keyword",
                    title: "搜索关键词",
                    type: "input",
                    description: "输入片名，聚合全网资源",
                    value: "庆余年"
                }
            ]
        },
        // 模块 2: Anime1 (日漫)
        {
            title: "日漫追番 (Anime1)",
            functionName: "loadAnime1",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                {
                    name: "category",
                    title: "分类",
                    type: "enumeration",
                    value: "latest",
                    enumOptions: [
                        { title: "📅 最新更新", value: "latest" },
                        { title: "🔥 人气推荐", value: "popular" }
                    ]
                }
            ]
        },
        // 模块 3: 厂长资源 (4K)
        {
            title: "厂长 4K 影院",
            functionName: "loadCzzy",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                {
                    name: "type",
                    title: "分类",
                    type: "enumeration",
                    value: "movie_bt_series", // 电影
                    enumOptions: [
                        { title: "🎬 最新电影", value: "movie_bt_series" },
                        { title: "📺 华语剧集", value: "tv_drama" },
                        { title: "🇺🇸 欧美剧集", value: "tv_drama_eu" },
                        { title: "🇰🇷 韩剧", value: "tv_drama_kr" },
                        { title: "🇯🇵 日剧", value: "tv_drama_jp" },
                        { title: "🐲 动漫", value: "anime" }
                    ]
                }
            ]
        }
    ]
};

// =========================================================================
// 1. 茶杯狐 (CupFox) - 聚合搜索
// =========================================================================
const CUPFOX_URL = "https://cupfox.app";

async function loadCupFox(params = {}) {
    const { keyword } = params;
    if (!keyword) return [{ id: "info", type: "text", title: "请输入关键词搜索" }];

    const url = `${CUPFOX_URL}/search?key=${encodeURIComponent(keyword)}`;
    console.log(`[CupFox] Searching: ${keyword}`);

    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        // 解析搜索结果列表
        $(".search-result-item").each((i, el) => {
            const $el = $(el);
            const $link = $el.find("a").first();
            const href = $link.attr("href");
            const title = $el.find(".text-truncate").text().trim();
            const img = $el.find("img").attr("data-src") || $el.find("img").attr("src");
            // 资源来源 (如: 红牛资源, 非凡资源)
            const source = $el.find(".text-muted").last().text().trim();

            if (href && title) {
                results.push({
                    id: href,
                    type: "link", // 触发详情解析
                    title: title,
                    coverUrl: img,
                    link: href.startsWith("http") ? href : `${CUPFOX_URL}${href}`,
                    description: `来源: ${source}`,
                    // 标记这是 CupFox 的链接
                    extra: { provider: "cupfox" }
                });
            }
        });

        if (results.length === 0) return [{ id: "empty", type: "text", title: "未找到相关资源" }];
        return results;

    } catch (e) {
        return [{ id: "err", type: "text", title: "搜索失败", subTitle: e.message }];
    }
}

// =========================================================================
// 2. Anime1 (日漫) - 直连 API
// =========================================================================
const ANIME1_API = "https://d1-api.anime1.me";

async function loadAnime1(params = {}) {
    const { page = 1, category = "latest" } = params;
    // Anime1 只有首页 API，没有很复杂的分类，我们只取首页列表
    // 实际 API: https://d1-api.anime1.me/v2/home/1 (Page 1)
    
    // 注意：Anime1 的 API 有时会变，更稳妥的是抓取网页 https://anime1.me/
    // 这里我们尝试抓取网页，因为网页结构更稳定
    const url = `https://anime1.me/page/${page}`;
    
    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $("article.post").each((i, el) => {
            const $el = $(el);
            const title = $el.find(".entry-title a").text().trim();
            const href = $el.find(".entry-title a").attr("href");
            const info = $el.find(".entry-meta").text().trim();
            
            // Anime1 首页没有图片，我们用随机二次元图或者不显示
            // 或者去 TMDB 搜一下 (为了速度这里先留空或用占位)
            
            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    subTitle: info,
                    link: href,
                    // 标记 provider
                    extra: { provider: "anime1" }
                });
            }
        });
        
        return results;
    } catch (e) {
        return [{ id: "err", type: "text", title: "Anime1 访问失败" }];
    }
}

// =========================================================================
// 3. 厂长资源 (Czzy) - 4K 影院
// =========================================================================
const CZZY_URL = "https://www.czzy77.com"; // 厂长域名经常变，这是目前的

async function loadCzzy(params = {}) {
    const { page = 1, type = "movie_bt_series" } = params;
    const url = `${CZZY_URL}/${type}/page/${page}`;

    try {
        const res = await Widget.http.get(url);
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".bt_img ul li").each((i, el) => {
            const $el = $(el);
            const $link = $el.find("a").first();
            const href = $link.attr("href");
            const title = $el.find("img").attr("alt");
            const img = $el.find("img").attr("data-original") || $el.find("img").attr("src");
            const status = $el.find(".jidi span").text().trim();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    link: href, // 通常是相对路径
                    subTitle: status,
                    extra: { provider: "czzy" }
                });
            }
        });
        return results;
    } catch (e) {
        return [{ id: "err", type: "text", title: "厂长资源访问失败" }];
    }
}

// =========================================================================
// 4. 全局详情解析 (Router)
// =========================================================================
// Forward 会自动调用 loadDetail 并传入 link，但我们需要区分是哪个源的 link
// 这里的技巧是：我们在 loadList 里返回的 item 并没有把 provider 传给 loadDetail 的标准参数
// 所以我们需要根据 URL 特征来判断是哪个源

async function loadDetail(link) {
    if (link.includes("cupfox") || link.includes("cf.")) {
        return await parseCupFox(link);
    } else if (link.includes("anime1.me")) {
        return await parseAnime1(link);
    } else if (link.includes("czzy")) {
        return await parseCzzy(link);
    }
    // 兜底
    return [{ id: "err", type: "text", title: "未知链接源" }];
}

// --- A. 茶杯狐解析 ---
async function parseCupFox(link) {
    // 茶杯狐详情页通常包含一个 "立即播放" 的按钮，指向最终的 m3u8 或解析页
    // 需要二次跳转
    try {
        const res = await Widget.http.get(link);
        const $ = Widget.html.load(res.data);
        
        // 找到播放列表
        // 结构通常是: .play-list a (href 就是播放页)
        const playUrl = $(".play-list a").first().attr("href");
        
        if (playUrl) {
            const fullPlayUrl = playUrl.startsWith("http") ? playUrl : `${CUPFOX_URL}${playUrl}`;
            const res2 = await Widget.http.get(fullPlayUrl);
            
            // 提取 m3u8
            // 模式: "url": "https://..."
            const match = res2.data.match(/"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
            if (match) {
                return [{
                    id: link,
                    type: "video",
                    title: $("h1").text().trim(),
                    videoUrl: match[1], // m3u8
                    playerType: "system"
                }];
            }
        }
        return [{ id: "err", type: "text", title: "未找到播放源" }];
    } catch (e) { return []; }
}

// --- B. Anime1 解析 ---
async function parseAnime1(link) {
    try {
        const res = await Widget.http.get(link, {
            headers: { "Cookie": "announcement_id=1" } // 绕过公告
        });
        const html = res.data;
        
        // Anime1 的视频通常在一个 API 请求里，或者直接在 <video> src
        // 它的播放器逻辑比较复杂，通常是 file.anime1.me
        // 简单提取: source src="..."
        const match = html.match(/file\.anime1\.me\/[a-zA-Z0-9]+/);
        
        if (match) {
            // 需要进一步构造 API 请求获取真实 mp4
            // 这里可能需要 WebView，或者深度解析
            // 简易版：直接返回 WebView
            return [{
                id: link,
                type: "webview",
                title: "点击在网页播放",
                link: link
            }];
        }
        
        // 尝试提取 iframe
        const $ = Widget.html.load(html);
        const videoSrc = $("video source").attr("src");
        if (videoSrc) {
             return [{
                id: link,
                type: "video",
                title: $(".entry-title").text(),
                videoUrl: videoSrc,
                playerType: "system"
            }];
        }
        
        return [{ id: "web", type: "webview", title: "网页播放", link: link }];
    } catch (e) { return []; }
}

// --- C. 厂长解析 ---
async function parseCzzy(link) {
    const fullLink = link.startsWith("http") ? link : `${CZZY_URL}${link}`;
    try {
        const res = await Widget.http.get(fullLink);
        const html = res.data;
        
        // 厂长通常用 iframe 嵌入，或者 var player_aaaa = { ... "url": "..." }
        const match = html.match(/"url"\s*:\s*"([^"]+)"/);
        
        if (match) {
            const rawUrl = match[1];
            // 如果是 m3u8 直连
            if (rawUrl.includes("m3u8")) {
                return [{
                    id: fullLink,
                    type: "video",
                    title: "正在播放",
                    videoUrl: rawUrl,
                    playerType: "system"
                }];
            }
        }
        
        // 如果没找到直连，返回 WebView
        return [{
            id: fullLink,
            type: "webview",
            title: "点击播放 (非直连)",
            link: fullLink
        }];
    } catch (e) { return []; }
}
