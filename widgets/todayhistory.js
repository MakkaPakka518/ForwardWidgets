WidgetMetadata = {
    id: "history_today_pro",
    title: "那年今日 (Pro)",
    author: "MakkaPakka",
    description: "自动根据当前日期，探索过去 50 年同日上映的经典电影。",
    version: "2.1.1",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "必须填写以获取数据。",
            value: ""
        }
    ],

    modules: [
        {
            title: "历史上的今天",
            functionName: "loadHistoryToday",
            type: "video", // 使用标准 video 类型
            cacheDuration: 43200, // 缓存 12 小时，因为每天只变一次
            params: [
                {
                    name: "region",
                    title: "上映地区",
                    type: "enumeration",
                    value: "Global",
                    enumOptions: [
                        { title: "全球 (Global)", value: "Global" },
                        { title: "美国 (US)", value: "US" },
                        { title: "中国 (CN)", value: "CN" },
                        { title: "香港 (HK)", value: "HK" },
                        { title: "日本 (JP)", value: "JP" },
                        { title: "英国 (GB)", value: "GB" }
                    ]
                },
                {
                    name: "sortOrder",
                    title: "排序方式",
                    type: "enumeration",
                    value: "time_desc",
                    enumOptions: [
                        { title: "时间: 由近到远 (近代->早期)", value: "time_desc" },
                        { title: "时间: 由远到近 (早期->近代)", value: "time_asc" },
                        { title: "评分: 由高到低 (经典优先)", value: "vote_desc" },
                        { title: "热度: 由高到低 (流行优先)", value: "pop_desc" }
                    ]
                }
            ]
        }
    ]
};

async function loadHistoryToday(params = {}) {
    const { apiKey, region = "Global", sortOrder = "time_desc" } = params;

    if (!apiKey) {
        return [{
            id: "err_no_key",
            type: "text",
            title: "配置缺失",
            subTitle: "请在设置中填入 TMDB API Key"
        }];
    }

    // 1. 获取当前系统时间 (核心动态逻辑)
    const today = new Date();
    const currentYear = today.getFullYear(); 
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    // 2. 动态生成目标年份
    // 自动计算：如果今年是2026，diff=1 -> 2025, diff=50 -> 1976
    const yearsAgo = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    const targetYears = yearsAgo.map(diff => ({
        year: currentYear - diff,
        diff: diff
    }));

    console.log(`[History] Date: ${month}-${day}, BaseYear: ${currentYear}`);

    let allMovies = [];

    // 分批并发请求 (避免瞬间请求过多被 TMDB 拒绝)
    const batchRequest = async (years) => {
        const promises = years.map(yObj => fetchMovieForDate(yObj.year, month, day, region, apiKey, yObj.diff));
        const results = await Promise.all(promises);
        results.forEach(list => { if (list) allMovies = allMovies.concat(list); });
    };

    // 执行请求
    await batchRequest(targetYears.slice(0, 5));
    await batchRequest(targetYears.slice(5, 10));
    await batchRequest(targetYears.slice(10));

    if (allMovies.length === 0) {
        return [{
            id: "empty",
            type: "text",
            title: "今日无大事",
            subTitle: `过去50年的 ${month}-${day} 没有高分电影上映`
        }];
    }

    // 3. 排序逻辑
    allMovies.sort((a, b) => {
        if (sortOrder === "time_desc") {
            return parseInt(b.yearStr) - parseInt(a.yearStr);
        } else if (sortOrder === "time_asc") {
            return parseInt(a.yearStr) - parseInt(b.yearStr);
        } else if (sortOrder === "vote_desc") {
            return parseFloat(b.rating) - parseFloat(a.rating);
        } else {
            return b.popularity - a.popularity;
        }
    });

    // 4. 格式化输出
    // 限制 20 个，防止列表过长
    return allMovies.slice(0, 20).map(item => ({
        id: String(item.id),
        tmdbId: parseInt(item.id),
        type: "tmdb",
        mediaType: "movie",

        // 标题只显示电影名，保持纯净
        title: item.title,

        // 副标题显示核心卖点：N周年纪念
        subTitle: `${item.diff}周年纪念 · ⭐️ ${item.rating}`,

        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",

        rating: item.rating,
        year: item.yearStr,
        description: item.overview || "暂无简介"
    }));
}

async function fetchMovieForDate(year, month, day, region, apiKey, diff) {
    const dateStr = `${year}-${month}-${day}`;
    // 基础筛选：必须有一定评分人数，防止垃圾数据
    // include_adult=false: 过滤成人内容
    let url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=zh-CN&include_adult=false&include_video=false&page=1`;

    // 精确锁定首映日期
    url += `&primary_release_date.gte=${dateStr}&primary_release_date.lte=${dateStr}`;

    if (region === "Global") {
        url += `&vote_count.gte=50`;
    } else {
        // 特定地区放宽评分人数要求，但增加 region 过滤
        url += `&region=${region}&vote_count.gte=10`;
    }

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;

        if (!data.results) return [];

        return data.results.map(m => ({
            id: m.id,
            title: m.title,
            poster_path: m.poster_path,
            backdrop_path: m.backdrop_path,
            rating: m.vote_average ? m.vote_average.toFixed(1) : "0.0",
            overview: m.overview,
            yearStr: String(year),
            diff: diff, // 传递差值 (例如 1年, 10年)
            popularity: m.popularity
        }));
    } catch (e) { return []; }
}
