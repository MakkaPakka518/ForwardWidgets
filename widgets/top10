WidgetMetadata = {
    id: "gemini.flixpatrol.strict",
    title: "国外流媒体 TOP10",
    author: "Makka Pakka",
    description: "抓取 Netflix/HBO 官方榜单",
    version: "2.1.0",
    requiredVersion: "0.0.1",
    modules: [
        {
            title: "官方 Top 10",
            functionName: "loadOfficialTop10",
            type: "list", // 明确指定模块类型
            requiresWebView: false,
            params: [
                // 1. API Key 放在首位，确保可见
                {
                    name: "apiKey",
                    title: "TMDB API Key (必填)",
                    type: "input",
                    description: "必须填写，否则无法加载海报和跳转播放",
                },
                // 2. 平台选择
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
                // 3. 地区选择
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
                // 4. 类型选择
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

async function loadOfficialTop10(params = {}) {
    const apiKey = params.apiKey;
    const platform = params.platform || "netflix";
    const region = params.region || "united-states";
    const mediaType = params.mediaType || "tv";

    // 0. 规范化错误返回 (必须包含 id 和 type)
    if (!apiKey) {
        return [{
            id: "error_no_key",
            title: "❌ 缺少 API Key",
            subTitle: "请在组件设置中填入 TMDB API Key", // 使用 subTitle
            type: "text",
            url: "" // 防止点击
        }];
    }

    console.log(`[FlixPatrol] Fetching: ${platform} / ${region}`);

    // 1. 尝试抓取 FlixPatrol (真实榜单)
    let titles = await fetchFlixPatrolData(platform, region, mediaType);

    // 2. 如果抓取失败，启用 TMDB 兜底
    if (titles.length === 0) {
        console.log("[FlixPatrol] Failed, fallback to TMDB...");
        return await fetchTmdbFallback(platform, region, mediaType, apiKey);
    }

    console.log(`[FlixPatrol] Got ${titles.length} titles. Matching TMDB...`);

    // 3. 将标题转换为 TMDB ID
    // 限制并发数为 10，防止被 TMDB 限流
    const searchPromises = titles.slice(0, 10).map((title, index) => 
        searchTmdb(title, mediaType, apiKey, index + 1)
    );

    const results = await Promise.all(searchPromises);
    const finalItems = results.filter(r => r !== null);

    if (finalItems.length === 0) {
        return [{
            id: "error_match_fail",
            title: "⚠️ 数据匹配失败",
            subTitle: "获取到了榜单标题，但 TMDB 搜索无结果",
            type: "text"
        }];
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
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" 
            }
        });

        const html = typeof res === 'string' ? res : (res.data || "");
        if (!html) return [];

        const $ = Widget.html.load(html);
        const tables = $('.card-table tbody');
        
        // FlixPatrol 页面结构：通常 Movie 在前，TV 在后
        // 或者只有一个表格
        let targetTable = null;
        if (tables.length >= 2) {
            targetTable = mediaType === "movie" ? tables.eq(0) : tables.eq(1);
        } else if (tables.length === 1) {
            targetTable = tables.eq(0);
        } else {
            return [];
        }

        const titles = [];
        targetTable.find('tr').each((i, el) => {
            if (i >= 10) return; // Top 10

            // 提取标题：尝试多种选择器以防网页改版
            // 1. 链接文本
            const textLink = $(el).find('a.hover\\:underline').text().trim();
            // 2. 表格第三列文本 (纯文本兜底)
            const textTd = $(el).find('td').eq(2).text().trim();
            
            const finalTitle = textLink || textTd;
            if (finalTitle && finalTitle.length > 1) {
                // 去除可能存在的年份后缀 (e.g. "Title (2024)")
                titles.push(finalTitle.split('(')[0].trim());
            }
        });

        return titles;
    } catch (e) {
        console.error("FlixPatrol Error:", e);
        return [];
    }
}

async function searchTmdb(queryTitle, mediaType, apiKey, rank) {
    // 标题清洗
    const cleanTitle = queryTitle.trim();
    const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;

        if (data && data.results && data.results.length > 0) {
            const match = data.results[0];
            
            // 严格遵循 data-formats.md
            return {
                id: String(match.id),       // 必须是 String
                type: "tmdb",
                tmdbId: parseInt(match.id), // 必须是 Int
                mediaType: mediaType,       // 必须明确
                
                title: `${rank}. ${match.name || match.title}`, 
                subTitle: match.original_name || match.original_title, // 使用 subTitle
                
                posterPath: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : "",
                backdropPath: match.backdrop_path ? `https://image.tmdb.org/t/p/w780${match.backdrop_path}` : "",
                
                rating: match.vote_average ? match.vote_average.toFixed(1) : "0.0",
                year: (match.first_air_date || match.release_date || "").substring(0, 4),
                
                // 附加信息，部分视图可能用到
                description: `官方榜单 #${rank}`
            };
        }
    } catch (e) {}
    return null;
}

async function fetchTmdbFallback(platform, region, mediaType, apiKey) {
    const providerMap = { "netflix": "8", "disney": "337", "hbo": "1899|118", "apple-tv": "350", "amazon-prime": "119" };
    const regionMap = { "united-states": "US", "south-korea": "KR", "taiwan": "TW", "hong-kong": "HK", "japan": "JP", "united-kingdom": "GB" };
    
    const pid = providerMap[platform] || "8";
    const reg = regionMap[region] || "US";

    const url = `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${apiKey}&watch_region=${reg}&with_watch_providers=${pid}&sort_by=popularity.desc&page=1&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;
        
        return (data.results || []).slice(0, 10).map((item, index) => ({
            id: String(item.id),         // String
            type: "tmdb",
            tmdbId: parseInt(item.id),   // Int
            mediaType: mediaType,
            
            title: `${index + 1}. ${item.title || item.name}`,
            subTitle: item.original_name || item.original_title,
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
            year: (item.first_air_date || item.release_date || "").substring(0, 4),
            description: `平台热度 #${index + 1}`
        }));
    } catch (e) { return []; }
}
