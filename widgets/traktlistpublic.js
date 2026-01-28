WidgetMetadata = {
    id: "trakt_personal_netfix",
    title: "Trakt 个人中心 (网络修复)",
    author: "MakkaPakka",
    description: "针对网络乱码优化，强制禁止 Gzip 压缩。",
    version: "3.0.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        { name: "traktUser", title: "Trakt 用户名 (Slug)", type: "input", description: "必填", value: "" }
    ],

    modules: [
        {
            title: "我的片单",
            functionName: "loadTraktProfile",
            type: "list",
            cacheDuration: 0,
            params: [
                {
                    name: "section",
                    title: "浏览区域",
                    type: "enumeration",
                    value: "watchlist",
                    enumOptions: [
                        { title: "📜 待看列表", value: "watchlist" },
                        { title: "📦 收藏列表", value: "collection" },
                        { title: "🕒 观看历史", value: "history" }
                    ]
                },
                {
                    name: "type",
                    title: "类型",
                    type: "enumeration",
                    value: "shows",
                    enumOptions: [ { title: "剧集", value: "shows" }, { title: "电影", value: "movies" } ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

const PUBLIC_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadTraktProfile(params = {}) {
    const { traktUser, section, type = "shows" } = params;
    const page = params.page || 1;

    if (!traktUser) return [{ id: "err", type: "text", title: "请填写 Trakt 用户名" }];

    // 构造 URL
    let url = "";
    // Watchlist 默认按 rank 排序，这是最稳的接口
    if (section === "watchlist") url = `https://api.trakt.tv/users/${traktUser}/watchlist/${type}/rank?extended=full&page=${page}&limit=15`;
    else if (section === "collection") url = `https://api.trakt.tv/users/${traktUser}/collection/${type}?extended=full&page=${page}&limit=15`;
    else url = `https://api.trakt.tv/users/${traktUser}/history/${type}?extended=full&page=${page}&limit=15`;

    try {
        const res = await Widget.http.get(url, {
            headers: { 
                "Content-Type": "application/json", 
                "trakt-api-version": "2", 
                "trakt-api-key": PUBLIC_TRAKT_ID,
                // 关键修复：禁止 Gzip 压缩，防止乱码
                "Accept-Encoding": "identity", 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        // 深度解析
        let data = res.data;
        // 如果 data 是字符串且看起来像 JSON，尝试手动解析
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) {}
        }

        if (!Array.isArray(data)) {
            // 如果返回的是对象（可能是错误信息），尝试读取
            if (data && data.error) throw new Error(data.error);
            // 可能是 404 页面的 HTML
            if (typeof data === 'string' && data.includes("html")) throw new Error("Trakt 网页错误 (404/500)");
            
            return [{ id: "err_fmt", type: "text", title: "数据格式错误", subTitle: "请检查网络或用户名" }];
        }

        if (data.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "列表为空" }] : [];

        // 正常处理
        const promises = data.map(async (item) => {
            const subject = item.show || item.movie || item;
            if (!subject?.ids?.tmdb) return null;

            let subInfo = `Trakt: ${subject.year || ""}`;
            if (section === "watchlist" && item.listed_at) subInfo = `添加于 ${item.listed_at.split('T')[0]}`;
            
            return await fetchTmdbDetail(subject.ids.tmdb, type === "movies" ? "movie" : "tv", subInfo, subject.title);
        });

        return (await Promise.all(promises)).filter(Boolean);

    } catch (e) {
        return [{ id: "err_net", type: "text", title: "网络/解析异常", subTitle: e.message.slice(0, 50) }];
    }
}

async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        // 免 Key TMDB
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        if (!d) return null; // TMDB 没数据也返回空

        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || originalTitle,
            genreTitle: year, 
            subTitle: subInfo,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            description: d.overview || "暂无简介",
            rating: d.vote_average?.toFixed(1)
        };
    } catch (e) { return null; }
}
