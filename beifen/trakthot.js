WidgetMetadata = {
    id: "trakt_hot_pro",
    title: "Trakt 热榜",
    author: "MakkaPakka",
    description: "多维度 Trakt 榜单，支持实时热播、最受欢迎和最受期待，智能容错。",
    version: "2.0.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取海报和详情。",
            value: ""
        },
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "建议填入自己的 ID 以防限流。",
            value: ""
        }
    ],

    modules: [
        {
            title: "Trakt 热榜",
            functionName: "loadTraktTrending",
            type: "video", // 使用标准 video 类型
            cacheDuration: 3600, // 缓存 1 小时
            params: [
                {
                    name: "listType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "trending",
                    enumOptions: [
                        { title: "实时热播 (Trending)", value: "trending" },
                        { title: "最受欢迎 (Popular)", value: "popular" },
                        { title: "最受期待 (Anticipated)", value: "anticipated" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "内容类型",
                    type: "enumeration",
                    value: "shows",
                    enumOptions: [
                        { title: "剧集 (TV Shows)", value: "shows" },
                        { title: "电影 (Movies)", value: "movies" }
                    ]
                }
            ]
        }
    ]
};

// 默认公共 ID
const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadTraktTrending(params = {}) {
    const { apiKey, listType = "trending", mediaType = "shows" } = params;
    const clientId = params.traktClientId || DEFAULT_TRAKT_ID;

    if (!apiKey) {
        return [{
            id: "err_no_key",
            type: "text",
            title: "配置缺失",
            subTitle: "请在设置中填入 TMDB API Key"
        }];
    }

    // 1. 尝试直连 Trakt
    console.log(`[Trakt] Fetching ${mediaType}/${listType}`);
    let traktData = await fetchTraktData(mediaType, listType, clientId);

    // 2. 失败处理：如果 Trakt 返回空，启用 TMDB 智能降级
    if (!traktData || traktData.length === 0) {
        console.warn("Trakt 失败，启用 TMDB 降级...");
        return await fetchTmdbFallback(mediaType, listType, apiKey);
    }

    // 3. 处理 Trakt 数据 (并发获取 TMDB 详情)
    const promises = traktData.slice(0, 15).map(async (item, index) => {
        // Trakt 数据结构不统一：
        // trending/anticipated 返回 { watchers: 123, show: {...} }
        // popular 直接返回 { title: ..., ids: {...} }
        let subject = item.show || item.movie || item;
        
        let stats = "";
        if (listType === "trending") stats = `🔥 ${item.watchers || 0} 人在看`;
        else if (listType === "anticipated") stats = `❤️ ${item.list_count || 0} 人想看`;
        else stats = `No. ${index + 1}`;

        if (!subject || !subject.ids || !subject.ids.tmdb) return null;

        return await fetchTmdbDetail(subject.ids.tmdb, mediaType, apiKey, stats, subject.title);
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean);
}

// ==========================================
// 辅助函数：网络请求
// ==========================================

async function fetchTraktData(mediaType, listType, clientId) {
    const url = `https://api.trakt.tv/${mediaType}/${listType}?limit=15`;
    try {
        const res = await Widget.http.get(url, {
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": clientId
            },
            timeout: 5000 // 设置超时
        });
        
        let data = res.data || [];
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) { return []; }
        }
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

async function fetchTmdbDetail(tmdbId, traktType, apiKey, stats, originalTitle) {
    const tmdbType = traktType === "shows" ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${apiKey}&language=zh-CN`;
    
    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;
        if (!data || !data.id) return null;

        // 构造返回对象
        return {
            id: String(data.id),
            tmdbId: parseInt(data.id),
            type: "tmdb",
            mediaType: tmdbType,
            
            title: data.name || data.title || originalTitle,
            subTitle: stats, // 将 Trakt 统计数据放在副标题
            description: data.overview || `原名: ${originalTitle}`, // 简介放下方
            
            posterPath: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : "",
            backdropPath: data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : "",
            
            rating: data.vote_average ? data.vote_average.toFixed(1) : "0.0",
            year: (data.first_air_date || data.release_date || "").substring(0, 4)
        };
    } catch (e) { return null; }
}

// ==========================================
// 兜底方案：智能降级
// ==========================================

async function fetchTmdbFallback(traktType, listType, apiKey) {
    const tmdbType = traktType === "shows" ? "tv" : "movie";
    
    // 智能选择最接近的 TMDB 接口
    let endpoint = "trending";
    let timeWindow = "day"; // trending 需要时间窗口
    
    if (listType === "popular") {
        endpoint = "popular"; // 对应 TMDB /movie/popular
        timeWindow = "";
    } else if (listType === "anticipated") {
        endpoint = "upcoming"; // 最受期待 -> 即将上映
        // TV 没有 upcoming 接口，回退到 on_the_air
        if (tmdbType === "tv") endpoint = "on_the_air"; 
        timeWindow = "";
    } else {
        // trending
        endpoint = "trending";
        timeWindow = "/week"; // 默认用周榜
    }

    // 构造 URL
    let url = "";
    if (endpoint === "trending") {
        url = `https://api.themoviedb.org/3/trending/${tmdbType}${timeWindow}?api_key=${apiKey}&language=zh-CN`;
    } else {
        url = `https://api.themoviedb.org/3/${tmdbType}/${endpoint}?api_key=${apiKey}&language=zh-CN&page=1`;
    }

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;
        const results = data.results || [];

        return results.slice(0, 15).map((item, index) => ({
            id: String(item.id),
            tmdbId: parseInt(item.id),
            type: "tmdb",
            mediaType: tmdbType,
            
            title: item.name || item.title,
            subTitle: `TMDB 榜单 #${index + 1}`, // 明确提示这是 TMDB 数据
            description: item.overview,
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
            year: (item.first_air_date || item.release_date || "").substring(0, 4)
        }));
    } catch(e) {
        return [{ 
            id: "err_all", 
            type: "text", 
            title: "加载失败", 
            subTitle: "Trakt 和 TMDB 均无法连接" 
        }];
    }
}
