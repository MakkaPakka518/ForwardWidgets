WidgetMetadata = {
    id: "douban_trakt_final_fix_v7",
    title: "豆瓣热榜 x Trakt (修复排序版)",
    author: "Makkapakka",
    description: "v7.0: 移植可用代码的请求头修复豆瓣接口；集成 Trakt 时间源进行本地精确排序。",
    version: "7.0.0",
    requiredVersion: "0.0.1",
    site: "https://movie.douban.com",

    globalParams: [], 

    modules: [
        {
            title: "全网热榜 (Trakt排序)",
            functionName: "loadDoubanTraktFusion",
            type: "list",
            cacheDuration: 3600, 
            params: [
                {
                    name: "category",
                    title: "榜单分类",
                    type: "enumeration",
                    defaultValue: "tv_domestic",
                    enumOptions: [
                        { title: "🇨🇳 热门国产剧", value: "tv_domestic" },
                        { title: "🇺🇸 热门欧美剧", value: "tv_american" },
                        { title: "🇰🇷 热门韩剧", value: "tv_korean" },
                        { title: "🇯🇵 热门日剧", value: "tv_japanese" },
                        { title: "🔥 综合热门剧集", value: "tv_hot" },
                        { title: "🎤 综合热门综艺", value: "show_hot" },
                        { title: "🇨🇳 国内综艺", value: "show_domestic" },
                        { title: "🌍 国外综艺", value: "show_foreign" },
                        { title: "🎬 热门电影", value: "movie_hot_gaia" }
                    ]
                },
                {
                    name: "sort",
                    title: "排序依据 (Trakt数据)",
                    type: "enumeration",
                    defaultValue: "update",
                    enumOptions: [
                        { title: "📅 按更新时间 (追更推荐)", value: "update" },
                        { title: "🆕 按首播年份 (新片推荐)", value: "release" },
                        { title: "🔥 豆瓣原始热度", value: "default" }
                    ]
                }
            ]
        }
    ]
};

// ==========================================
// 0. 核心配置 (提取自你提供的代码)
// ==========================================

const TRAKT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const TRAKT_API_BASE = "https://api.trakt.tv";

// ✅ 这里的 Headers 是直接复制你给的文件，经过验证可用
const DOUBAN_HEADERS = {
    "Referer": "https://m.douban.com/movie",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
};

// ==========================================
// 1. 主逻辑
// ==========================================

async function loadDoubanTraktFusion(params = {}) {
    const category = params.category || "tv_domestic";
    const sort = params.sort || "update";

    // 1. [豆瓣] 获取原始列表 (带修复Headers)
    const doubanItems = await fetchDoubanList(category);
    
    if (!doubanItems || doubanItems.length === 0) {
        return [{ id: "empty", type: "text", title: "豆瓣列表为空", subTitle: "请检查网络连接" }];
    }

    // 2. [Trakt & TMDB] 获取详细时间
    // 为了不卡死，我们并发处理，但限制数量 (取前25个最热的进行精细化排序，剩下的太冷门也没必要查)
    const itemsToProcess = doubanItems.slice(0, 25); 
    
    const enrichedItems = await Promise.all(itemsToProcess.map(async (item) => {
        return await fetchMetadata(item);
    }));

    // 过滤掉没查到的
    let validItems = enrichedItems.filter(Boolean);

    // 3. [本地排序] 核心：根据 Trakt 时间重排
    if (sort === "update") {
        validItems.sort((a, b) => {
            // 谁的时间大（越近），谁排前面
            return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
        });
    } else if (sort === "release") {
        validItems.sort((a, b) => {
            return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
        });
    }
    // 如果是 default，就保留 doubanItems 的原始顺序 (需要在 enrich 步骤保留 index，这里简化处理，default 就不排了)

    // 4. 生成卡片
    return validItems.map(item => buildCard(item));
}

// ==========================================
// 2. 数据获取链 (Douban -> TMDB -> Trakt)
// ==========================================

async function fetchDoubanList(key) {
    // 豆瓣接口
    const url = `https://m.douban.com/rexxar/api/v2/subject_collection/${key}/items?start=0&count=40`;

    try {
        const res = await Widget.http.get(url, {
            headers: DOUBAN_HEADERS // ✅ 使用修复后的UA
        });
        
        const json = JSON.parse(res.body || res.data);
        const items = json.subject_collection_items || [];
        
        return items.map(i => ({
            title: i.title,
            year: i.year,
            // 豆瓣类型映射
            type: (key.includes("movie") || i.type === "movie") ? "movie" : "tv"
        }));
    } catch (e) {
        console.log("Douban Error: " + e.message);
        return [];
    }
}

async function fetchMetadata(doubanItem) {
    const { title, year, type } = doubanItem;
    
    try {
        // --- A. TMDB 搜 ID (因为 Trakt 搜中文很烂，TMDB 搜中文很准) ---
        const searchRes = await Widget.tmdb.search(title, type, { language: "zh-CN" });
        const results = searchRes.results || [];
        if (results.length === 0) return null;

        // 年份匹配：豆瓣2024，TMDB可能2023或2025，允许误差
        const targetYear = parseInt(year);
        let bestMatch = results.find(r => {
            const rYear = parseInt((r.first_air_date || r.release_date || "0").substring(0, 4));
            return Math.abs(rYear - targetYear) <= 1;
        });
        if (!bestMatch) bestMatch = results[0]; // 没匹配到年份就拿第一个

        const tmdbId = bestMatch.id;
        
        // --- B. Trakt 查时间 (核心) ---
        let sortDate = "1900-01-01"; // 用于排序
        let releaseDate = "1900-01-01"; // 首播
        let nextEpInfo = null;
        let lastEpInfo = null;
        let status = "";

        if (type === "tv") {
            // 1. 查基本信息 (获取首播时间、状态)
            // URL: /shows/tmdb:ID?extended=full
            let summary = {};
            try {
                const sRes = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}?extended=full`, {
                    headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID }
                });
                summary = JSON.parse(sRes.body || sRes.data);
            } catch(e) {}
            
            releaseDate = summary.first_aired || bestMatch.first_air_date || "1900-01-01";
            status = summary.status;

            // 2. 查最新/下一集 (决定排序权重)
            // 如果是正在播出的剧 (returning series)，我们去查 next_episode
            if (status === "returning series" || status === "in production") {
                try {
                    const nextRes = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/next_episode?extended=full`, {
                        headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID }
                    });
                    if (nextRes.status !== 204) {
                        nextEpInfo = JSON.parse(nextRes.body || nextRes.data);
                    }
                } catch(e) {}
            }

            // 如果没有下一集，查上一集 (Last Episode)
            if (!nextEpInfo) {
                try {
                    const lastRes = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/last_episode?extended=full`, {
                        headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID }
                    });
                    if (lastRes.status !== 204) {
                        lastEpInfo = JSON.parse(lastRes.body || lastRes.data);
                    }
                } catch(e) {}
            }

            // ⚡️ 计算排序时间 (sortDate)
            if (nextEpInfo) {
                // 有待播集：把时间设为未来，或者设为极大的权重，或者直接用播出时间
                // 这里我们用播出时间。
                sortDate = nextEpInfo.first_aired;
            } else if (lastEpInfo) {
                // 已播：用最后一集时间
                sortDate = lastEpInfo.first_aired;
            } else {
                sortDate = releaseDate;
            }

        } else {
            // 电影
            sortDate = bestMatch.release_date || "1900-01-01";
            releaseDate = sortDate;
        }

        return {
            tmdb: bestMatch, // TMDB数据负责图片
            douban: doubanItem, 
            mediaType: type,
            // 排序数据
            sortDate: sortDate,
            releaseDate: releaseDate,
            // 展示数据
            nextEp: nextEpInfo,
            lastEp: lastEpInfo,
            status: status
        };

    } catch (e) {
        return null;
    }
}

// ==========================================
// 3. UI 构建
// ==========================================

function buildCard(item) {
    const d = item.tmdb;
    const typeLabel = item.mediaType === "tv" ? "剧" : "影";
    
    // 🖼️ 图片
    let imagePath = "";
    if (d.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${d.backdrop_path}`;
    else if (d.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${d.poster_path}`;

    // 📅 日期格式化
    const formatDate = (str) => {
        if (!str || str.startsWith("1900")) return "";
        const date = new Date(str);
        if (isNaN(date.getTime())) return "";
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${m}-${day}`;
    };

    let subTitle = "";
    let genreTitle = ""; 

    if (item.mediaType === "tv") {
        if (item.nextEp) {
            // 🔜 待播
            const date = formatDate(item.nextEp.first_aired);
            subTitle = `🔜 ${date} 更新 S${item.nextEp.season}E${item.nextEp.number}`;
            genreTitle = date;
        } else if (item.lastEp) {
            // 📅 已播最新
            const date = formatDate(item.lastEp.first_aired);
            // 检查剧集状态
            if (item.status === "ended" || item.status === "canceled") {
                const year = (item.releaseDate || "").substring(0, 4);
                subTitle = `[${typeLabel}] 已完结 (${year})`;
                genreTitle = "End";
            } else {
                subTitle = `📅 ${date} 更新 S${item.lastEp.season}E${item.lastEp.number}`;
                genreTitle = date;
            }
        } else {
            const year = (item.releaseDate || "").substring(0, 4);
            subTitle = `[${typeLabel}] ${year}`;
            genreTitle = year;
        }
    } else {
        // 电影
        const date = formatDate(item.releaseDate);
        subTitle = `🎬 ${date} 上映`;
        genreTitle = (item.releaseDate || "").substring(0, 4);
    }
    
    return {
        id: `douban_${d.id}`,
        tmdbId: d.id, 
        type: "tmdb",
        mediaType: item.mediaType,
        title: d.name || d.title,
        subTitle: subTitle,
        genreTitle: genreTitle,
        description: d.overview,
        posterPath: imagePath
    };
}
