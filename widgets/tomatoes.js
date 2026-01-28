WidgetMetadata = {
    id: "rottentomatoes_pro",
    title: "烂番茄口碑榜",
    author: "MakkaPakka",
    description: "抓取烂番茄新鲜认证(>75%)榜单，并自动匹配 TMDB 中文元数据。",
    version: "2.2.8",
    requiredVersion: "0.0.1",
    site: "https://www.rottentomatoes.com",

    // 0. 全局免 Key
    globalParams: [],

    modules: [
        {
            title: "口碑避雷针",
            functionName: "loadRottenTomatoes",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "listType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "movies_home",
                    enumOptions: [
                        { title: "流媒体热映 (Streaming)", value: "movies_home" },
                        { title: "院线热映 (Theaters)", value: "movies_theater" },
                        { title: "热门剧集 (TV Popular)", value: "tv_popular" },
                        { title: "最新剧集 (TV New)", value: "tv_new" },
                        { title: "最佳流媒体 (Best Streaming)", value: "movies_best" }
                    ]
                },
                // 必须显式声明 page 参数
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                }
            ]
        }
    ]
};

const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

const RT_URLS = {
    "movies_theater": "https://www.rottentomatoes.com/browse/movies_in_theaters/sort:popular?minTomato=75",
    "movies_home": "https://www.rottentomatoes.com/browse/movies_at_home/sort:popular?minTomato=75",
    "movies_best": "https://www.rottentomatoes.com/browse/movies_at_home/sort:critic_highest?minTomato=90",
    "tv_popular": "https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular?minTomato=75",
    "tv_new": "https://www.rottentomatoes.com/browse/tv_series_browse/sort:newest?minTomato=75"
};

async function loadRottenTomatoes(params = {}) {
    const { listType = "movies_home" } = params;
    // 获取页码，默认为 1
    const page = params.page || 1;
    const pageSize = 15;

    console.log(`[RT] Fetching: ${listType}, Page: ${page}`);
    
    // 1. 抓取全量列表 (因为是 HTML 抓取，一次性拿所有)
    const allItems = await fetchRottenTomatoesList(listType);

    if (allItems.length === 0) {
        return page === 1 ? [{ id: "err_scrape", type: "text", title: "暂无数据", subTitle: "无法连接到烂番茄" }] : [];
    }

    // 2. 本地分页逻辑 (Slice)
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    // 如果请求页码超出范围，返回空数组停止加载
    if (start >= allItems.length) return [];

    const pageItems = allItems.slice(start, end);

    // 3. 并发匹配 TMDB
    const matchPromises = pageItems.map((item, index) => 
        searchTmdb(item, start + index + 1)
    );

    const results = await Promise.all(matchPromises);
    const finalItems = results.filter(Boolean);

    // 容错：如果这一页全部匹配失败，尝试返回下一页（或者直接返回空）
    // 为了体验，这里我们只返回成功的
    return finalItems;
}

// 抓取逻辑 (增加缓存以避免翻页时重复请求烂番茄)
async function fetchRottenTomatoesList(type) {
    // 这里可以加一个简单的内存缓存，但考虑到 Widget 生命周期，每次请求可能都是独立的
    // Forward 的 cacheDuration 已经帮我们处理了函数级别的缓存，所以这里直接请求即可
    const url = RT_URLS[type] || RT_URLS["movies_home"];
    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" }
        });
        const html = res.data || "";
        if (!html) return [];
        const $ = Widget.html.load(html);
        const items = [];
        
        $('[data-qa="discovery-media-list-item"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('[data-qa="discovery-media-list-item-title"]').text().trim();
            if (!title) return;
            const scoreEl = $el.find('score-pairs');
            items.push({
                title: title,
                tomatoScore: scoreEl.attr('critics-score') || "",
                popcornScore: scoreEl.attr('audiencescore') || "",
                mediaType: type.includes("tv") ? "tv" : "movie"
            });
        });
        return items;
    } catch (e) { return []; }
}

async function searchTmdb(rtItem, rank) {
    const cleanTitle = rtItem.title.replace(/\s\(\d{4}\)$/, "");
    
    try {
        // 免 Key 搜索
        const res = await Widget.tmdb.get(`/search/${rtItem.mediaType}`, {
            params: { query: cleanTitle, language: "zh-CN" }
        });
        
        const data = res || {};
        if (!data.results || data.results.length === 0) return null;
        
        const match = data.results[0];
        
        // 1. 类型
        const genreText = (match.genre_ids || [])
            .map(id => GENRE_MAP[id])
            .filter(Boolean)
            .slice(0, 2)
            .join(" / ");
            
        // 2. 年份
        const year = (match.first_air_date || match.release_date || "").substring(0, 4);

        // 3. 烂番茄分数
        let scoreTags = [];
        if (rtItem.tomatoScore) scoreTags.push(`🍅 ${rtItem.tomatoScore}%`);
        if (rtItem.popcornScore) scoreTags.push(`🍿 ${rtItem.popcornScore}%`);
        const subTitle = scoreTags.length > 0 ? scoreTags.join("  ") : "烂番茄认证";

        return {
            id: String(match.id),
            type: "tmdb",
            tmdbId: match.id,
            mediaType: rtItem.mediaType,
            
            title: `${rank}. ${match.name || match.title}`,
            genreTitle: [year, genreText].filter(Boolean).join(" • "),
            subTitle: subTitle,
            description: match.overview || `原名: ${rtItem.title}`,
            
            posterPath: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : "",
            backdropPath: match.backdrop_path ? `https://image.tmdb.org/t/p/w780${match.backdrop_path}` : "",
            
            rating: match.vote_average ? match.vote_average.toFixed(1) : "0.0",
            year: year
        };
    } catch (e) { return null; }
}
