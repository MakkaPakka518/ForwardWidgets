WidgetMetadata = {
    id: "trakt_personal_ultimate",
    title: "Trakt 个人中心 (全能版)",
    author: "MakkaPakka",
    description: "一站式管理 Trakt 待看、收藏、历史及自定义列表。",
    version: "2.0.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        {
            name: "traktUser",
            title: "Trakt 用户名 (必填)",
            type: "input",
            description: "你的 Trakt ID (Slug)",
            value: ""
        },
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "默认使用公共 ID。",
            value: ""
        }
    ],

    modules: [
        {
            title: "我的片单",
            functionName: "loadTraktProfile",
            type: "list",
            cacheDuration: 300, // 5分钟刷新
            params: [
                {
                    name: "section",
                    title: "浏览区域",
                    type: "enumeration",
                    value: "watchlist",
                    enumOptions: [
                        { title: "📜 待看列表 (Watchlist)", value: "watchlist" },
                        { title: "📦 收藏列表 (Collection)", value: "collection" },
                        { title: "🕒 观看历史 (History)", value: "history" },
                        { title: "📑 自定义列表 (Lists)", value: "lists" }, // 获取所有自定义列表
                        { title: "⭐ 评分记录 (Ratings)", value: "ratings" }
                    ]
                },
                // 仅对 Watchlist/Collection/History/Ratings 有效
                {
                    name: "type",
                    title: "内容筛选",
                    type: "enumeration",
                    value: "shows",
                    belongTo: { paramName: "section", value: ["watchlist", "collection", "history", "ratings"] },
                    enumOptions: [
                        { title: "剧集", value: "shows" },
                        { title: "电影", value: "movies" }
                    ]
                }
            ]
        }
    ]
};

const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

// 核心加载函数
async function loadTraktProfile(params = {}) {
    const { traktUser, section, type = "shows" } = params;
    const clientId = params.traktClientId || DEFAULT_TRAKT_ID;

    if (!traktUser) return [{ id: "err", type: "text", title: "请填写 Trakt 用户名" }];

    // --- A. 自定义列表 (Lists) 模式 ---
    if (section === "lists") {
        return await fetchUserLists(traktUser, clientId);
    }

    // --- B. 列表内容模式 (Watchlist/Collection/History) ---
    // 如果是 lists 下的某个具体列表，需要用户点击后进入 (但 Widget 暂不支持二级菜单跳转回本函数)
    // 这里我们先处理一级标准列表
    
    let url = "";
    if (section === "watchlist") url = `https://api.trakt.tv/users/${traktUser}/watchlist/${type}/rank?extended=full`;
    else if (section === "collection") url = `https://api.trakt.tv/users/${traktUser}/collection/${type}?extended=full`;
    else if (section === "history") url = `https://api.trakt.tv/users/${traktUser}/history/${type}?limit=20&extended=full`;
    else if (section === "ratings") url = `https://api.trakt.tv/users/${traktUser}/ratings/${type}?extended=full`;

    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });
        const data = res.data || [];
        if (!Array.isArray(data)) return [{ id: "err", type: "text", title: "无数据或权限不足" }];

        // 并发匹配 TMDB
        const promises = data.slice(0, 20).map(async (item) => {
            const subject = item.show || item.movie || item; // 兼容不同接口返回
            if (!subject?.ids?.tmdb) return null;

            // 附加信息
            let subInfo = "";
            if (section === "ratings") subInfo = `你的评分: ${item.rating}⭐`;
            else if (section === "history") subInfo = `观看于: ${item.watched_at.split('T')[0]}`;
            else subInfo = `Trakt: ${subject.year || ""}`;

            return await fetchTmdbDetail(subject.ids.tmdb, type === "movies" ? "movie" : "tv", subInfo, subject.title);
        });

        return (await Promise.all(promises)).filter(Boolean);

    } catch (e) {
        return [{ id: "err_net", type: "text", title: "请求失败", subTitle: e.message }];
    }
}

// 辅助：获取用户的自定义列表清单
async function fetchUserLists(username, clientId) {
    const url = `https://api.trakt.tv/users/${username}/lists`;
    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });
        const data = res.data || [];
        
        return data.map(list => ({
            id: `list_${list.ids.slug}`,
            type: "text", // 暂时无法点击展开，只能作为展示，或者做成 link 跳转 Web
            title: `📑 ${list.name}`,
            subTitle: `${list.item_count} 个项目 | 👍 ${list.likes}`,
            description: list.description || "无描述",
            // 如果 Forward 支持递归调用，这里可以做更深层的交互
            // 目前只能展示
        }));
    } catch (e) {
        return [{ id: "err", type: "text", title: "获取列表失败" }];
    }
}

// 辅助：TMDB 详情 (免 Key)
async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        const genres = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");
        
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || originalTitle,
            genreTitle: [year, genres].filter(Boolean).join(" • "),
            subTitle: subInfo,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            description: d.overview,
            rating: d.vote_average?.toFixed(1),
            year: year
        };
    } catch (e) { return null; }
}
