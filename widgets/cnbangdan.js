WidgetMetadata = {
    id: "cn_streaming_hot",
    title: "全网流媒体热度榜",
    author: "MakkaPakka",
    description: "汇聚 腾讯/爱奇艺/优酷/芒果/B站/Bangumi 的实时热门内容。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    // 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取剧集/电影的海报和数据。",
            value: ""
        }
    ],

    modules: [
        // 模块 1: 影视热播 (腾讯/爱奇艺/优酷/芒果)
        {
            title: "影视热播榜",
            functionName: "loadStreamingHot",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "platform",
                    title: "播放平台",
                    type: "enumeration",
                    value: "tencent",
                    enumOptions: [
                        { title: "腾讯视频 (Tencent)", value: "337" },
                        { title: "爱奇艺 (iQIYI)", value: "436" },
                        { title: "优酷 (Youku)", value: "430" },
                        { title: "芒果TV (Mango)", value: "384" },
                        { title: "Bilibili (影视)", value: "336" }
                    ]
                },
                {
                    name: "type",
                    title: "内容类型",
                    type: "enumeration",
                    value: "tv",
                    enumOptions: [
                        { title: "剧集 (TV)", value: "tv" },
                        { title: "电影 (Movie)", value: "movie" }
                    ]
                }
            ]
        },
        // 模块 2: 动漫新番 (B站/Bangumi)
        {
            title: "动漫新番榜",
            functionName: "loadAnimeHot",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "source",
                    title: "数据来源",
                    type: "enumeration",
                    value: "bilibili_hot",
                    enumOptions: [
                        { title: "Bilibili 番剧榜 (日漫)", value: "bilibili_hot" },
                        { title: "Bilibili 国创榜 (国漫)", value: "bilibili_cn" },
                        { title: "Bangumi 每日放送", value: "bangumi_daily" }
                    ]
                }
            ]
        }
    ]
};

// ==========================================
// 逻辑 A: 影视热播 (基于 TMDB Watch Providers)
// ==========================================

async function loadStreamingHot(params = {}) {
    const { apiKey, platform, type = "tv" } = params;

    if (!apiKey) {
        return [{ id: "err", type: "text", title: "请填写 TMDB API Key" }];
    }

    console.log(`[CN-Stream] Fetching Platform: ${platform}, Type: ${type}`);

    // TMDB Discover 接口
    // with_watch_providers: 平台ID
    // watch_region: CN (中国大陆)
    // sort_by: popularity.desc (按热度)
    // with_original_language: zh|cn (稍微过滤一下，优先展示国产，但也包含引进的热门剧)
    let url = `https://api.themoviedb.org/3/discover/${type}?api_key=${apiKey}&language=zh-CN&sort_by=popularity.desc&include_adult=false&page=1&watch_region=CN&with_watch_providers=${platform}`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;
        
        if (!data.results || data.results.length === 0) {
            return [{ id: "empty", type: "text", title: "暂无数据", subTitle: "该平台近期可能无收录数据" }];
        }

        return data.results.map((item, index) => {
            const title = item.name || item.title;
            const year = (item.first_air_date || item.release_date || "").substring(0, 4);
            
            return {
                id: String(item.id),
                tmdbId: parseInt(item.id),
                type: "tmdb",
                mediaType: type,
                
                title: `${index + 1}. ${title}`,
                subTitle: `🔥 热度 ${(item.popularity).toFixed(0)}`,
                description: item.overview || "",
                
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
                
                rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
                year: year
            };
        });
    } catch (e) {
        return [{ id: "err_net", type: "text", title: "网络错误", subTitle: e.message }];
    }
}

// ==========================================
// 逻辑 B: 动漫新番 (Bilibili / Bangumi API)
// ==========================================

async function loadAnimeHot(params = {}) {
    const { apiKey, source } = params;
    
    // 1. Bilibili 处理逻辑
    if (source.startsWith("bilibili")) {
        // rid: 13 = 番剧(日漫), 168 = 国创(国漫)
        const rid = source === "bilibili_cn" ? 168 : 13;
        // B站官方排行榜 API
        const bUrl = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;
        
        try {
            const res = await Widget.http.get(bUrl);
            const data = res.data || {};
            const list = data.data?.list || [];
            
            if (list.length === 0) return [{ id: "empty", type: "text", title: "B站接口无返回" }];

            // 转换 B站数据 -> Forward 格式
            // 注意：B站只有标题，没有 TMDB ID。我们需要显示出来，点击后最好能搜一下。
            // 这里为了体验，我们尽可能匹配 TMDB (需要 apiKey)，如果没 key 就只显示文字。
            
            const results = [];
            // 只取前 15 个，避免搜索请求过多
            for (let i = 0; i < Math.min(list.length, 15); i++) {
                const item = list[i];
                const bItem = {
                    id: `bili_${item.aid}`, // 临时ID
                    type: "tmdb", // 伪装成 tmdb 类型让 Forward 尝试搜索
                    mediaType: "tv",
                    title: `${i + 1}. ${item.title}`,
                    subTitle: `🔥 ${formatPlay(item.stat.view)}播放 · ${item.stat.danmaku}弹幕`,
                    description: item.desc || "",
                    posterPath: item.pic ? item.pic.replace("http:", "https:") : "",
                    year: "" 
                };

                // 如果有 Key，尝试用 B站标题去 TMDB 搜一个 ID (增强体验)
                if (apiKey) {
                    const tmdbItem = await searchTmdbByTitle(item.title, apiKey);
                    if (tmdbItem) {
                        bItem.tmdbId = tmdbItem.id;
                        bItem.id = String(tmdbItem.id);
                        bItem.posterPath = tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : bItem.posterPath;
                        bItem.backdropPath = tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdbItem.backdrop_path}` : "";
                        bItem.rating = tmdbItem.vote_average.toFixed(1);
                    }
                }
                results.push(bItem);
            }
            return results;

        } catch (e) {
            return [{ id: "err_bili", type: "text", title: "B站连接失败", subTitle: e.message }];
        }
    }

    // 2. Bangumi 处理逻辑
    if (source === "bangumi_daily") {
        try {
            const bgmUrl = "https://api.bgm.tv/calendar";
            const res = await Widget.http.get(bgmUrl);
            const data = res.data || [];
            
            // 获取今天是周几
            const dayIndex = new Date().getDay(); // 0-6 (0是周日)
            // Bangumi 返回的是 [{weekday: {id: 1...}, items: []}] 数组
            // weekday.id: 1=Mon, 7=Sun.  JS: 1=Mon, 0=Sun. 需转换
            const bgmDayId = dayIndex === 0 ? 7 : dayIndex;
            
            const todayData = data.find(d => d.weekday.id === bgmDayId);
            
            if (!todayData || !todayData.items) {
                return [{ id: "empty", type: "text", title: "今日无番剧更新" }];
            }

            const results = [];
            // Bangumi 数据也需要去 TMDB 匹配
            for (const item of todayData.items) {
                // 优先用中文名，没有则用原名
                const queryName = item.name_cn || item.name;
                
                const bItem = {
                    id: `bgm_${item.id}`,
                    type: "tmdb",
                    mediaType: "tv",
                    title: queryName,
                    subTitle: item.name, // 原名
                    // Bangumi 图片质量较差，通常是 grid
                    posterPath: item.images?.large || item.images?.common || "", 
                };

                if (apiKey) {
                    const tmdbItem = await searchTmdbByTitle(queryName, apiKey);
                    if (tmdbItem) {
                        bItem.tmdbId = tmdbItem.id;
                        bItem.id = String(tmdbItem.id);
                        bItem.posterPath = tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : bItem.posterPath;
                        bItem.backdropPath = tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdbItem.backdrop_path}` : "";
                        bItem.rating = tmdbItem.vote_average.toFixed(1);
                        bItem.title = tmdbItem.name || queryName; // 修正为 TMDB 标准名
                    }
                }
                results.push(bItem);
            }
            return results;

        } catch (e) {
            return [{ id: "err_bgm", type: "text", title: "Bangumi 连接失败" }];
        }
    }
}

// ==========================================
// 辅助工具
// ==========================================

// 格式化 B站播放量 (12345 -> 1.2万)
function formatPlay(num) {
    if (!num) return "0";
    if (num > 100000000) return (num / 100000000).toFixed(1) + "亿";
    if (num > 10000) return (num / 10000).toFixed(1) + "万";
    return num.toString();
}

// 简单的 TMDB 搜索器 (用于把 B站/Bangumi 标题转为 TMDB ID)
async function searchTmdbByTitle(query, apiKey) {
    // 过滤掉 B站标题里常见的干扰词 (如 "第xx话", "如果是", "..." )
    // 简单处理：只取前10个字，或者直接搜
    const cleanQuery = query.split(" ")[0].substring(0, 15); 
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}&language=zh-CN&page=1`;
    
    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        if (data.results && data.results.length > 0) {
            return data.results[0];
        }
    } catch (e) {}
    return null;
}
