WidgetMetadata = {
    id: "trakt_personal_debug",
    title: "Trakt 个人中心 (调试版)",
    author: "MakkaPakka",
    description: "内置高权重 Key，增强错误提示。",
    version: "2.3.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        { name: "traktUser", title: "Trakt 用户名 (Slug)", type: "input", description: "必填，且账号必须设为 Public (公开)", value: "" }
    ],

    modules: [
        {
            title: "我的片单",
            functionName: "loadTraktProfile",
            type: "list",
            cacheDuration: 0, // 禁用缓存以调试
            params: [
                {
                    name: "section",
                    title: "浏览区域",
                    type: "enumeration",
                    value: "watchlist",
                    enumOptions: [
                        { title: "📜 待看列表 (Watchlist)", value: "watchlist" },
                        { title: "📦 收藏列表 (Collection)", value: "collection" },
                        { title: "🕒 观看历史 (History)", value: "history" }
                    ]
                },
                {
                    name: "type",
                    title: "内容筛选",
                    type: "enumeration",
                    value: "shows",
                    enumOptions: [ { title: "剧集", value: "shows" }, { title: "电影", value: "movies" } ]
                },
                {
                    name: "sort",
                    title: "排序",
                    type: "enumeration",
                    value: "added",
                    enumOptions: [ { title: "按添加时间", value: "added" }, { title: "按排名", value: "rank" } ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

const PUBLIC_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadTraktProfile(params = {}) {
    const { traktUser, section, type = "shows", sort = "added" } = params;
    const page = params.page || 1;

    if (!traktUser) return [{ id: "err", type: "text", title: "请填写 Trakt 用户名" }];

    // 构造 URL
    let url = "";
    if (section === "watchlist") url = `https://api.trakt.tv/users/${traktUser}/watchlist/${type}/${sort}?extended=full&page=${page}&limit=15`;
    else if (section === "collection") url = `https://api.trakt.tv/users/${traktUser}/collection/${type}?extended=full&page=${page}&limit=15`;
    else url = `https://api.trakt.tv/users/${traktUser}/history/${type}?extended=full&page=${page}&limit=15`;

    console.log(`[Trakt] Req: ${url}`);

    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": PUBLIC_TRAKT_ID }
        });

        // 状态码检查 (关键)
        if (res.statusCode === 404) return [{ id: "err_404", type: "text", title: "用户不存在", subTitle: `未找到用户: ${traktUser}` }];
        if (res.statusCode === 401 || res.statusCode === 403) return [{ id: "err_403", type: "text", title: "隐私设置受限", subTitle: "请在 Trakt 官网将账户设为 Public" }];
        if (res.statusCode !== 200) return [{ id: "err_http", type: "text", title: `Trakt API 错误 ${res.statusCode}`, subTitle: "请稍后重试" }];

        const data = res.data;
        if (!data) return page === 1 ? [{ id: "empty", type: "text", title: "列表为空 (No Data)" }] : [];
        if (!Array.isArray(data)) return [{ id: "err_fmt", type: "text", title: "数据格式错误", subTitle: "Trakt 返回了非数组数据" }];
        if (data.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "列表是空的", subTitle: "快去 Trakt 添加点东西吧" }] : [];

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
        return [{ id: "err_net", type: "text", title: "网络异常", subTitle: e.message }];
    }
}

async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || originalTitle,
            genreTitle: year, // 简化显示
            subTitle: subInfo,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            description: d.overview || "暂无简介",
            rating: d.vote_average?.toFixed(1)
        };
    } catch (e) { return null; }
}
