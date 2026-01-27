WidgetMetadata = {
    id: "whattowatch_fix",
    title: "今天看什么",
    author: "MakkaPakka",
    description: "剧荒拯救者。支持 Trakt 历史推荐与随机发现，增强容错。",
    version: "2.1.7",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "必须填写",
            value: ""
        },
        {
            name: "traktUser",
            title: "Trakt 用户名 (可选)",
            type: "input",
            description: "填入 Trakt 个人主页网址末尾的 ID (slug)",
            value: ""
        },
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "如遇 Trakt Error 请自行申请并填入",
            value: ""
        }
    ],

    modules: [
        {
            title: "今天看什么",
            functionName: "loadRecommendations",
            type: "video",
            cacheDuration: 0,
            params: [
                {
                    name: "mediaType",
                    title: "想看什么",
                    type: "enumeration",
                    value: "tv",
                    enumOptions: [
                        { title: "电视剧 (TV Shows)", value: "tv" },
                        { title: "电影 (Movies)", value: "movie" }
                    ]
                }
            ]
        }
    ]
};

// 备用 ID (如果默认的挂了，用户可以不填直接用这个)
const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadRecommendations(params = {}) {
    const { apiKey, traktUser, mediaType = "tv" } = params;
    // 优先用用户填的 ID，没有则用默认
    const traktClientId = params.traktClientId || DEFAULT_TRAKT_ID;

    if (!apiKey) {
        return [{
            id: "err_key",
            type: "text",
            title: "配置缺失",
            subTitle: "请在设置中填写 TMDB API Key"
        }];
    }

    let results = [];
    let reason = "";

    // === 逻辑分流 ===
    if (traktUser) {
        console.log(`[Mode] Trakt: ${traktUser}`);
        try {
            // 尝试获取 Trakt 历史
            const historyItem = await fetchLastWatched(traktUser, mediaType, traktClientId);
            
            if (historyItem && historyItem.tmdbId) {
                // 成功：获取相似推荐
                reason = `因为你看过: ${historyItem.title}`;
                results = await fetchTmdbRecommendations(historyItem.tmdbId, mediaType, apiKey);
            } else {
                // 失败（无记录）：回退随机
                reason = "未找到观看记录，随机推荐";
                results = await fetchRandomTmdb(mediaType, apiKey);
            }
        } catch (e) {
            // 失败（API 错误）：回退随机，并提示错误
            console.error("Trakt Fail:", e);
            reason = `Trakt 连接失败 (${e.message})，随机推荐`;
            results = await fetchRandomTmdb(mediaType, apiKey);
        }
    } else {
        // 无 Trakt 用户：直接随机
        reason = "🎲 随机发现";
        results = await fetchRandomTmdb(mediaType, apiKey);
    }

    // === 结果处理 ===
    if (!results || results.length === 0) {
        return [{
            id: "err_empty",
            type: "text",
            title: "未找到推荐",
            subTitle: "可能是 TMDB 连接失败，请检查网络"
        }];
    }

    // 格式化输出
    return results.slice(0, 12).map(item => {
        const title = item.name || item.title;
        const orgTitle = item.original_name || item.original_title;
        
        return {
            id: String(item.id),
            tmdbId: parseInt(item.id),
            type: "tmdb",
            mediaType: mediaType,
            
            title: title,
            // 在副标题显示来源或错误提示，让用户知道发生了什么
            subTitle: reason, 
            description: item.overview || `原名: ${orgTitle}`,
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
            year: (item.first_air_date || item.release_date || "").substring(0, 4)
        };
    });
}

// === 工具函数 ===

async function fetchLastWatched(username, type, clientId) {
    const traktType = type === "tv" ? "shows" : "movies";
    // 增加 timeout 防止卡死
    const url = `https://api.trakt.tv/users/${username}/history/${traktType}?limit=1`;
    
    // 这里不再内部 catch，而是抛出错误给主函数处理
    const res = await Widget.http.get(url, {
        headers: {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": clientId
        },
        timeout: 5000 // 5秒超时
    });

    if (res.statusCode === 404) throw new Error("用户未找到");
    if (res.statusCode === 403) throw new Error("隐私设置受限");
    if (res.statusCode >= 400) throw new Error(`API ${res.statusCode}`);

    const data = res.data || [];
    if (data.length > 0) {
        const item = data[0];
        const work = item.show || item.movie;
        if (work?.ids?.tmdb) {
            return { tmdbId: work.ids.tmdb, title: work.title };
        }
    }
    return null;
}

async function fetchTmdbRecommendations(id, type, key) {
    const url = `https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${key}&language=zh-CN&page=1`;
    try {
        const res = await Widget.http.get(url);
        return (res.data || {}).results || [];
    } catch (e) { return []; }
}

async function fetchRandomTmdb(type, key) {
    // 随机因子：页码 + 年份
    const page = Math.floor(Math.random() * 30) + 1;
    const year = Math.floor(Math.random() * (2024 - 2015 + 1)) + 2015;
    
    let url = `https://api.themoviedb.org/3/discover/${type}?api_key=${key}&language=zh-CN&sort_by=popularity.desc&include_adult=false&vote_count.gte=100&page=${page}`;
    
    // 加入年份限制，避免太老的片
    if (type === "movie") url += `&primary_release_year=${year}`;
    else url += `&first_air_date_year=${year}`;

    try {
        const res = await Widget.http.get(url);
        let items = (res.data || {}).results || [];
        
        // 洗牌算法打乱
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        return items;
    } catch (e) { return []; }
}
