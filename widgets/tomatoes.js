WidgetMetadata = {
    id: "rottentomatoes",
    title: "烂番茄口碑榜",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "抓取 烂番茄 新鲜认证(>75%)榜单",
    version: "2.2.1",
    requiredVersion: "0.0.1",
    modules: [
        {
            title: "口碑避雷针",
            functionName: "loadRottenTomatoes",
            type: "list",
            requiresWebView: false,
            params: [
                // 1. 【核心修复】将 API Key 移回组件内部参数，确保可见！
                {
                    name: "apiKey",
                    title: "TMDB API Key (必填)",
                    type: "input",
                    description: "必须填写，用于匹配 Emby 播放",
                },
                // 2. 榜单类型选择
                {
                    name: "listType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "movies_home",
                    enumOptions: [
                        { title: "流媒体热映电影 (Streaming)", value: "movies_home" },
                        { title: "院线热映电影 (Theaters)", value: "movies_theater" },
                        { title: "热门剧集 (TV Popular)", value: "tv_popular" },
                        { title: "最新剧集 (TV New)", value: "tv_new" },
                        { title: "最佳流媒体电影 (Best Streaming)", value: "movies_best" }
                    ]
                }
            ]
        }
    ]
};

async function loadRottenTomatoes(params = {}) {
    // 1. 直接从组件参数获取 Key
    const apiKey = params.apiKey;

    // 错误处理：如果没有 Key，返回红色提示
    if (!apiKey) {
        return [{
            id: "err_no_key",
            title: "❌ 请填写 API Key",
            subTitle: "点击组件进入编辑模式填写",
            type: "text",
            url: ""
        }];
    }

    const listType = params.listType || "movies_home";
    console.log(`[RT] Fetching list: ${listType}`);

    // 2. 抓取烂番茄 (带 minTomato=75 过滤)
    const rtItems = await fetchRottenTomatoesList(listType);

    if (rtItems.length === 0) {
        return [{
            id: "err_scrape",
            title: "⚠️ 获取失败",
            subTitle: "烂番茄网站连接超时或无数据",
            type: "text"
        }];
    }

    console.log(`[RT] Scraped ${rtItems.length} items. Matching TMDB...`);

    // 3. TMDB 转换 (取前 12 个)
    const searchPromises = rtItems.slice(0, 12).map((item, index) => 
        searchTmdb(item, apiKey, index + 1)
    );

    const results = await Promise.all(searchPromises);
    const finalItems = results.filter(r => r !== null);

    if (finalItems.length === 0) {
        return [{
            id: "err_match",
            title: "⚠️ TMDB 匹配失败",
            subTitle: "获取到了英文片名，但 TMDB 搜不到",
            type: "text"
        }];
    }

    return finalItems;
}

// ==========================================
// 核心：烂番茄网页解析
// ==========================================
async function fetchRottenTomatoesList(type) {
    let url = "";
    // 强制 minTomato=75
    switch (type) {
        case "movies_theater":
            url = "https://www.rottentomatoes.com/browse/movies_in_theaters/sort:popular?minTomato=75";
            break;
        case "movies_home":
            url = "https://www.rottentomatoes.com/browse/movies_at_home/sort:popular?minTomato=75";
            break;
        case "movies_best":
            url = "https://www.rottentomatoes.com/browse/movies_at_home/sort:critic_highest?minTomato=90";
            break;
        case "tv_popular":
            url = "https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular?minTomato=75";
            break;
        case "tv_new":
            url = "https://www.rottentomatoes.com/browse/tv_series_browse/sort:newest?minTomato=75";
            break;
        default:
            url = "https://www.rottentomatoes.com/browse/movies_at_home/sort:popular?minTomato=75";
    }

    try {
        const res = await Widget.http.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)"
            }
        });

        const html = typeof res === 'string' ? res : (res.data || "");
        if (!html) return [];

        const $ = Widget.html.load(html);
        const items = [];

        // 解析烂番茄列表
        $('[data-qa="discovery-media-list-item"]').each((i, el) => {
            const titleEl = $(el).find('[data-qa="discovery-media-list-item-title"]');
            let title = titleEl.text().trim();
            
            // 解析分数 (烂番茄自定义标签 <score-pairs>)
            const scoreEl = $(el).find('score-pairs');
            const tomatoScore = scoreEl.attr('critics-score') || "";
            const audienceScore = scoreEl.attr('audiencescore') || "";

            if (title) {
                const isTv = type.includes("tv");
                items.push({
                    title: title,
                    tomatoScore: tomatoScore,
                    popcornScore: audienceScore,
                    mediaType: isTv ? "tv" : "movie"
                });
            }
        });

        return items;

    } catch (e) {
        console.error("RT Error:", e);
        return [];
    }
}

// ==========================================
// TMDB 匹配工具
// ==========================================
async function searchTmdb(rtItem, apiKey, rank) {
    const query = rtItem.title;
    const mediaType = rtItem.mediaType;

    const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;

        if (data && data.results && data.results.length > 0) {
            const match = data.results[0];
            
            // 构造副标题：显示烂番茄分数
            let subTitle = "";
            if (rtItem.tomatoScore) subTitle += `🍅 ${rtItem.tomatoScore}% `;
            if (rtItem.popcornScore) subTitle += `🍿 ${rtItem.popcornScore}%`;
            if (!subTitle) subTitle = match.original_name || match.original_title;

            return {
                id: String(match.id),       // 必须是 String
                type: "tmdb",
                tmdbId: parseInt(match.id), // 必须是 Int
                mediaType: mediaType,
                
                title: `${rank}. ${match.name || match.title}`, 
                subTitle: subTitle, 
                
                posterPath: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : "",
                backdropPath: match.backdrop_path ? `https://image.tmdb.org/t/p/w780${match.backdrop_path}` : "",
                
                rating: match.vote_average ? match.vote_average.toFixed(1) : "0.0",
                year: (match.first_air_date || match.release_date || "").substring(0, 4),
                description: `原名: ${rtItem.title} | 烂番茄认证`
            };
        }
    } catch (e) {}
    return null;
}
