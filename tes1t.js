WidgetMetadata = {
    id: "universal_video_hub_final",
    title: "全能影视聚合",
    author: "MakkaPakka",
    description: "聚合 在线之家/Libvio/AGE动漫/茶杯狐。去除了已失效的低端影视。",
    version: "3.1.0",
    requiredVersion: "0.0.1",
    site: "https://zxzj.site",

    modules: [
        {
            title: "美剧韩剧 (在线之家)",
            functionName: "loadZxzj",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                { 
                    name: "type", title: "分类", type: "enumeration", value: "1",
                    enumOptions: [
                        { title: "🎬 电影", value: "1" },
                        { title: "🇺🇸 美剧", value: "2" },
                        { title: "🇰🇷 韩剧", value: "3" },
                        { title: "🇯🇵 日剧", value: "4" },
                        { title: "🐲 动漫", value: "5" }
                    ]
                }
            ]
        },
        {
            title: "综合影视 (Libvio)",
            functionName: "loadLibvio",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                {
                    name: "type", title: "分类", type: "enumeration", value: "1",
                    enumOptions: [
                        { title: "🎬 电影", value: "1" },
                        { title: "📺 剧集", value: "2" },
                        { title: "🇯🇵 日韩", value: "15" },
                        { title: "🇺🇸 欧美", value: "16" }
                    ]
                }
            ]
        },
        {
            title: "二次元 (AGE动漫)",
            functionName: "loadAgeDm",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                {
                    name: "status", title: "状态", type: "enumeration", value: "all",
                    enumOptions: [
                        { title: "全部", value: "all" },
                        { title: "连载中", value: "1" },
                        { title: "已完结", value: "2" }
                    ]
                }
            ]
        },
        {
            title: "全网搜片 (茶杯狐)",
            functionName: "loadCupFox",
            type: "video",
            params: [
                { name: "keyword", title: "搜索关键词", type: "input", value: "庆余年" }
            ]
        }
    ]
};

// ==========================================
// 1. 在线之家 (Zxzj)
// ==========================================
const ZXZJ_URL = "https://www.zxzj.site"; 

async function loadZxzj(params = {}) {
    const { page = 1, type = "1" } = params;
    const url = `${ZXZJ_URL}/vodshow/${type}--------${page}---.html`;

    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".stui-vodlist__box").each((i, el) => {
            const $el = $(el);
            const href = $el.find("a.stui-vodlist__thumb").attr("href");
            const title = $el.find("a.stui-vodlist__thumb").attr("title");
            const img = $el.find("a.stui-vodlist__thumb").attr("data-original");
            const status = $el.find(".pic-text").text();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    subTitle: status,
                    link: `${ZXZJ_URL}${href}`,
                    extra: { provider: "zxzj" }
                });
            }
        });
        return results;
    } catch (e) { return [{ id: "err", type: "text", title: "在线之家加载失败" }]; }
}

// ==========================================
// 2. Libvio
// ==========================================
const LIB_URL = "https://libvio.app";

async function loadLibvio(params = {}) {
    const { page = 1, type = "1" } = params;
    const url = `${LIB_URL}/show/${type}--------${page}---.html`;

    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".stui-vodlist__box").each((i, el) => {
            const $el = $(el);
            const href = $el.find("a.stui-vodlist__thumb").attr("href");
            const title = $el.find("a.stui-vodlist__thumb").attr("title");
            const img = $el.find("a.stui-vodlist__thumb").attr("data-original");
            const status = $el.find(".pic-text").text();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    subTitle: status,
                    link: `${LIB_URL}${href}`,
                    extra: { provider: "libvio" }
                });
            }
        });
        return results;
    } catch (e) { return [{ id: "err", type: "text", title: "Libvio 加载失败" }]; }
}

// ==========================================
// 3. AGE动漫
// ==========================================
const AGE_URL = "https://www.agemys.net";

async function loadAgeDm(params = {}) {
    const { page = 1, status = "all" } = params;
    const url = `${AGE_URL}/catalog/all-${status}-all-all-all-time-${page}`;

    try {
        const res = await Widget.http.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".video_item").each((i, el) => {
            const $el = $(el);
            const href = $el.find("a").attr("href");
            const title = $el.find(".title").text().trim();
            const img = $el.find("img").attr("src");
            const ep = $el.find(".info").text().trim();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    subTitle: ep,
                    link: `${AGE_URL}${href}`,
                    extra: { provider: "age" }
                });
            }
        });
        return results;
    } catch (e) { return [{ id: "err", type: "text", title: "AGE动漫加载失败" }]; }
}

// ==========================================
// 4. 茶杯狐 (CupFox)
// ==========================================
const CUPFOX_URL = "https://cupfox.app";

async function loadCupFox(params = {}) {
    const { keyword } = params;
    if (!keyword) return [{ id: "info", type: "text", title: "请输入关键词" }];

    const url = `${CUPFOX_URL}/search?key=${encodeURIComponent(keyword)}`;
    try {
        const res = await Widget.http.get(url);
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".search-result-item").each((i, el) => {
            const $el = $(el);
            const href = $el.find("a").attr("href");
            const title = $el.find(".text-truncate").text().trim();
            const img = $el.find("img").attr("data-src") || $el.find("img").attr("src");
            const source = $el.find(".text-muted").last().text().trim();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    link: href.startsWith("http") ? href : `${CUPFOX_URL}${href}`,
                    description: `来源: ${source}`,
                    extra: { provider: "cupfox" }
                });
            }
        });
        return results;
    } catch (e) { return []; }
}

// ==========================================
// 5. 详情与播放解析 (Router)
// ==========================================

async function loadDetail(link) {
    if (link.includes("zxzj")) return await parseZxzj(link);
    if (link.includes("libvio")) return await parseLibvio(link);
    if (link.includes("agemys")) return await parseAge(link);
    if (link.includes("cupfox")) return await parseCupFox(link);
    return [{ id: "web", type: "webview", title: "网页播放", link: link }];
}

// A. 在线之家解析
async function parseZxzj(link) {
    try {
        const res = await Widget.http.get(link);
        const $ = Widget.html.load(res.data);
        const playUrlRelative = $(".stui-content__playlist a").first().attr("href");
        if (!playUrlRelative) return [{ id: "err", type: "text", title: "未找到播放列表" }];
        
        const playUrl = `${ZXZJ_URL}${playUrlRelative}`;
        const res2 = await Widget.http.get(playUrl);
        const jsonMatch = res2.data.match(/player_aaaa\s*=\s*({.*?})/);
        if (jsonMatch) {
            const json = JSON.parse(jsonMatch[1]);
            return [{
                id: link,
                type: "video",
                title: $("h1").text().trim(),
                videoUrl: json.url,
                playerType: "system",
                customHeaders: { "Referer": ZXZJ_URL }
            }];
        }
    } catch (e) {}
    return [{ id: "web", type: "webview", title: "网页播放", link: link }];
}

// B. Libvio 解析
async function parseLibvio(link) {
    try {
        const res = await Widget.http.get(link);
        const $ = Widget.html.load(res.data);
        const playHref = $(".stui-content__playlist a").first().attr("href");
        if (playHref) {
            const playUrl = `${LIB_URL}${playHref}`;
            const res2 = await Widget.http.get(playUrl);
            const match = res2.data.match(/"url":"([^"]+)"/);
            if (match) {
                return [{
                    id: link,
                    type: "video",
                    title: "Libvio 播放",
                    videoUrl: match[1],
                    playerType: "system"
                }];
            }
        }
    } catch (e) {}
    return [{ id: "web", type: "webview", title: "网页播放", link: link }];
}

// C. AGE 解析 (Webview)
async function parseAge(link) {
    try {
        const res = await Widget.http.get(link);
        const $ = Widget.html.load(res.data);
        const playHref = $(".movurl li a").first().attr("href");
        if (playHref) {
            const playUrl = `${AGE_URL}${playHref}`;
            return [{ id: playUrl, type: "webview", title: "AGE 播放", link: playUrl }];
        }
    } catch (e) {}
    return [{ id: "web", type: "webview", title: "网页播放", link: link }];
}

// D. 茶杯狐 (Webview)
async function parseCupFox(link) {
    return [{ id: link, type: "webview", title: "茶杯狐播放", link: link }];
}
