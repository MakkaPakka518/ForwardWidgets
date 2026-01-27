WidgetMetadata = {
    id: "trakt_random_pro",
    title: "Trakt 惊喜推荐",
    author: "MakkaPakka",
    description: "从你最近观看的剧集中随机抽取 5 部剧，推荐相似的剧集，每 12 小时刷新一次。",
    version: "1.0.6",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取推荐数据。",
            value: ""
        },
        {
            name: "traktUser",
            title: "Trakt 用户名 (必填)",
            type: "input",
            description: "填入 Trakt 个人主页网址末尾的 ID (slug)",
            value: ""
        },
        {
            name: "clientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "建议填入以防限流。",
            value: ""
        }
    ],
    modules: [
        {
            title: "今日惊喜推荐",
            functionName: "loadRandomMix",
            type: "list", // 推荐使用 list 类型以支持 genreTitle
            cacheDuration: 43200, 
            params: [] 
        }
    ]
};

// 默认公共 ID
const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

// TMDB 类型映射
const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "战争政治", 37: "西部"
};

async function loadRandomMix(params = {}) {
    const { apiKey, traktUser } = params;
    const clientId = params.clientId || DEFAULT_TRAKT_ID;

    if (!apiKey || !traktUser) {
        return [{ id: "err_missing", type: "text", title: "参数缺失", subTitle: "请在设置中填写 TMDB Key 和 Trakt 用户名" }];
    }

    const uniqueShows = await fetchUniqueHistory(traktUser, clientId);
    if (uniqueShows.length === 0) {
        return [{ id: "err_empty", type: "text", title: "暂无记录", subTitle: "Trakt 历史为空或账号私密" }];
    }

    const candidatePool = uniqueShows.slice(0, 30);
    console.log(`[Mix] Candidates: ${candidatePool.length}`);

    const pickCount = Math.min(candidatePool.length, 5);
    const seeds = getRandomSeeds(candidatePool, pickCount);
    
    console.log(`[Mix] Seeds: ${seeds.map(s => s.title).join(", ")}`);

    const promiseList = seeds.map(seed => fetchTmdbRecs(seed, apiKey));
    const resultsArray = await Promise.all(promiseList);

    const mixedList = [];
    let maxRecsLen = 0;
    for (const list of resultsArray) {
        if (list.length > maxRecsLen) maxRecsLen = list.length;
    }

    const seenIds = new Set();
    for (let i = 0; i < maxRecsLen; i++) {
        for (const list of resultsArray) {
            if (i < list.length) {
                const item = list[i];
                if (!seenIds.has(item.tmdbId)) {
                    seenIds.add(item.tmdbId);
                    mixedList.push(item);
                }
            }
        }
    }

    const finalItems = mixedList.slice(0, 20);
    if (finalItems.length === 0) {
        return [{ id: "err_tmdb", type: "text", title: "无推荐结果", subTitle: "TMDB 暂无相关推荐数据" }];
    }

    return finalItems;
}

// ==========================================
// 辅助逻辑
// ==========================================

async function fetchUniqueHistory(username, clientId) {
    const url = `https://api.trakt.tv/users/${username}/history/shows?limit=100`;
    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId },
            timeout: 5000
        });
        const data = res.data || [];
        if (!Array.isArray(data)) return [];
        const uniqueMap = new Map();
        for (const item of data) {
            const show = item.show;
            if (show && show.ids && show.ids.tmdb) {
                if (!uniqueMap.has(show.ids.tmdb)) {
                    uniqueMap.set(show.ids.tmdb, { tmdbId: show.ids.tmdb, title: show.title });
                }
            }
        }
        return Array.from(uniqueMap.values());
    } catch (e) { return []; }
}

function getRandomSeeds(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

async function fetchTmdbRecs(seedItem, apiKey) {
    const url = `https://api.themoviedb.org/3/tv/${seedItem.tmdbId}/recommendations?api_key=${apiKey}&language=zh-CN&page=1`;
    
    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        
        if (!data.results) return [];

        return data.results.slice(0, 5).map(item => {
            // 1. 类型处理
            const genreText = (item.genre_ids || [])
                .map(id => GENRE_MAP[id])
                .filter(Boolean)
                .slice(0, 2)
                .join(" / ");
            
            // 2. 年份处理
            const year = (item.first_air_date || "").substring(0, 4);
            const score = item.vote_average ? item.vote_average.toFixed(1) : "0.0";

            return {
                id: String(item.id),
                tmdbId: parseInt(item.id),
                type: "tmdb",
                mediaType: "tv",
                
                title: item.name || item.title,
                
                // 【核心修改】年份 • 类型
                genreTitle: [year, genreText].filter(Boolean).join(" • "),
                
                // 副标题：推荐来源 (最重要信息)
                subTitle: `✨ 源于: ${seedItem.title}`,
                
                // 简介：评分 + 剧情
                description: `⭐ ${score} | ${item.overview || "暂无简介"}`,
                
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
                
                rating: score,
                year: year
            };
        });
    } catch (e) { return []; }
}
