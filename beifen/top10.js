WidgetMetadata = {
    id: "flixpatrol_pro",
    title: "国外流媒体 TOP10",
    author: "MakkaPakka",
    description: "抓取 Netflix/HBO 等平台官方榜单，智能匹配 TMDB 中文数据。",
    version: "1.0.7",
    requiredVersion: "0.0.1",
    site: "https://flixpatrol.com",
 
    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取海报和匹配中文数据。",
            value: ""
        }
    ],
    modules: [
        {
            title: "官方 Top 10",
            functionName: "loadOfficialTop10",
            type: "list", // 推荐使用 list 类型以支持 genreTitle
            cacheDuration: 3600,
            params: [
                {
                    name: "platform",
                    title: "流媒体平台",
                    type: "enumeration",
                    value: "netflix",
                    enumOptions: [
                        { title: "Netflix (网飞)", value: "netflix" },
                        { title: "HBO (Max)", value: "hbo" },
                        { title: "Disney+ (迪士尼)", value: "disney" },
                        { title: "Apple TV+", value: "apple-tv" },
                        { title: "Amazon Prime", value: "amazon-prime" }
                    ]
                },
                {
                    name: "region",
                    title: "榜单地区",
                    type: "enumeration",
                    value: "united-states",
                    enumOptions: [
                        { title: "美国 (United States)", value: "united-states" },
                        { title: "韩国 (South Korea)", value: "south-korea" },
                        { title: "台湾 (Taiwan)", value: "taiwan" },
                        { title: "香港 (Hong Kong)", value: "hong-kong" },
                        { title: "日本 (Japan)", value: "japan" },
                        { title: "英国 (United Kingdom)", value: "united-kingdom" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "榜单类型",
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

// TMDB 类型映射表 (通用)
const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

async function loadOfficialTop10(params = {}) {
    const { apiKey, platform = "netflix", region = "united-states", mediaType = "tv" } = params;

    if (!apiKey) {
        return [{ id: "err_no_key", type: "text", title: "配置缺失", subTitle: "请在设置中填入 TMDB API Key" }];
    }

    console.log(`[FlixPatrol] Fetching: ${platform} / ${region}`);

    // 1. 抓取
    let titles = await fetchFlixPatrolData(platform, region, mediaType);

    // 2. 兜底
    if (titles.length === 0) {
        console.log("[FlixPatrol] Failed, fallback to TMDB...");
        return await fetchTmdbFallback(platform, region, mediaType, apiKey);
    }

    // 3. 匹配
    const searchPromises = titles.slice(0, 10).map((title, index) => 
        searchTmdb(title, mediaType, apiKey, index + 1)
    );

    const results = await Promise.all(searchPromises);
    const finalItems = results.filter(Boolean);

    if (finalItems.length === 0) {
        return [{ id: "err_match", type: "text", title: "匹配失败", subTitle: "TMDB 搜索无结果" }];
    }

    return finalItems;
}

// ==========================================
// 辅助函数
// ==========================================

async function fetchFlixPatrolData(platform, region, mediaType) {
    const url = `https://flixpatrol.com/top10/${platform}/${region}/`;
    try {
        const res = await Widget.http.get(url, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
                "Referer": "https://flixpatrol.com/"
            }
        });
        const html = res.data || "";
        if (!html) return [];
        const $ = Widget.html.load(html);
        
        let targetTable = null;
        const sectionKeyword = mediaType === "movie" ? "Movies" : "TV";
        
        $('div.card').each((i, el) => {
            if ($(el).find('h2').text().includes(sectionKeyword)) {
                targetTable = $(el).find('table tbody');
                return false;
            }
        });

        if (!targetTable) {
            const tables = $('table tbody');
            if (tables.length >= 2) targetTable = mediaType === "movie" ? tables.eq(0) : tables.eq(1);
            else if (tables.length === 1) targetTable = tables.eq(0);
            else return [];
        }

        const titles = [];
        targetTable.find('tr').each((i, el) => {
            if (i >= 10) return;
            let title = $(el).find('a.hover\\:underline').text().trim() || $(el).find('td').eq(2).text().trim();
            if (title && title.length > 1) {
                titles.push(title.replace(/\s\(\d{4}\)$/, '').trim());
            }
        });
        return titles;
    } catch (e) { return []; }
}

async function searchTmdb(queryTitle, mediaType, apiKey, rank) {
    const cleanTitle = queryTitle.trim();
    const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data;
        if (!data || !data.results || data.results.length === 0) return null;
        
        const match = data.results[0];
        
        // 1. 获取类型文本
        const genreText = (match.genre_ids || [])
            .map(id => GENRE_MAP[id])
            .filter(Boolean)
            .slice(0, 2)
            .join(" / ");
            
        // 2. 获取年份
        const year = (match.first_air_date || match.release_date || "").substring(0, 4);

        return {
            id: String(match.id),
            type: "tmdb",
            tmdbId: match.id,
            mediaType: mediaType,
            
            title: `${rank}. ${match.name || match.title}`,
            
            // 【UI 核心】年份 • 类型
            genreTitle: [year, genreText].filter(Boolean).join(" • "),
            
            // 副标题：原名
            subTitle: match.original_name || match.original_title,
            
            description: `榜单来源: FlixPatrol #${rank}`,
            
            posterPath: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : "",
            backdropPath: match.backdrop_path ? `https://image.tmdb.org/t/p/w780${match.backdrop_path}` : "",
            
            rating: match.vote_average ? match.vote_average.toFixed(1) : "0.0",
            year: year
        };
    } catch (e) { return null; }
}

async function fetchTmdbFallback(platform, region, mediaType, apiKey) {
    const providerMap = { "netflix": "8", "disney": "337", "hbo": "1899|118", "apple-tv": "350", "amazon-prime": "119" };
    const regionMap = { "united-states": "US", "south-korea": "KR", "taiwan": "TW", "hong-kong": "HK", "japan": "JP", "united-kingdom": "GB" };
    
    const pid = providerMap[platform] || "8";
    const reg = regionMap[region] || "US";
    const url = `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${apiKey}&watch_region=${reg}&with_watch_providers=${pid}&sort_by=popularity.desc&page=1&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        return (res.data?.results || []).slice(0, 10).map((item, index) => {
            const year = (item.first_air_date || item.release_date || "").substring(0, 4);
            const genreText = (item.genre_ids || []).map(id => GENRE_MAP[id]).slice(0, 2).join(" / ");
            
            return {
                id: String(item.id), type: "tmdb", tmdbId: item.id, mediaType: mediaType,
                title: `${index + 1}. ${item.title || item.name}`,
                genreTitle: [year, genreText].filter(Boolean).join(" • "), // 兜底也加上
                subTitle: item.original_name || item.original_title,
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
                rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
                year: year,
                description: `平台热度 #${index + 1}`
            };
        });
    } catch (e) { return []; }
}
