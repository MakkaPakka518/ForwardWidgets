// =======================================================
// 模块名称：流媒体 & Trakt 热榜 (基石版 v1.0)
// 作者：Gemini
// 功能：提供 Netflix/Disney+ 及 Trakt 的实时热度榜
// =======================================================

WidgetMetadata = {
  id: "stream_trakt_hub_basic", // 唯一ID，防止冲突
  title: "流媒体 & Trakt 热榜",
  author: "Gemini",
  description: "第一阶段测试：包含 Trakt 趋势与主流流媒体热榜。",
  version: "1.0.0",
  // 核心：必须声明 type: 'list'
  modules: [
    {
      title: "热榜聚合",
      type: "list", 
      functionName: "loadRankingHub",
      requiresWebView: false,
      cacheDuration: 3600, // 缓存1小时
      params: [
        {
          name: "source",
          title: "选择榜单源",
          type: "enumeration",
          defaultValue: "trakt_trend",
          enumOptions: [
            { title: "🌍 Trakt 实时趋势", value: "trakt_trend" },
            { title: "🟥 Netflix (网飞)", value: "netflix" },
            { title: "🟦 Disney+ (迪士尼)", value: "disney" },
            { title: "🍏 Apple TV+", value: "apple" },
            { title: "🦁 HBO / Max", value: "hbo" }
          ]
        },
        {
          name: "media_type",
          title: "媒体类型",
          type: "enumeration",
          defaultValue: "tv",
          enumOptions: [
            { title: "📺 剧集 (TV)", value: "tv" },
            { title: "🎬 电影 (Movie)", value: "movie" }
          ]
        }
      ]
    }
  ]
};

// =======================================================
// 1. 核心常量
// =======================================================

// Trakt 公用 Client ID (借用自您的旧脚本)
const TRAKT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";

// 流媒体对应的 TMDB Network ID
const NETWORK_IDS = {
  "netflix": "213",
  "disney": "2739",
  "apple": "2552",
  "hbo": "49"  // HBO
};

// =======================================================
// 2. 主逻辑入口 (绝对不能抛出异常)
// =======================================================

async function loadRankingHub(params) {
  try {
    const source = params.source || "trakt_trend";
    const type = params.media_type || "tv";

    // A. 如果选的是 Trakt
    if (source === "trakt_trend") {
      return await fetchTraktTrending(type);
    } 
    
    // B. 如果选的是流媒体 (走 TMDB)
    else {
      const netId = NETWORK_IDS[source];
      return await fetchStreamingHot(type, netId);
    }

  } catch (e) {
    // 全局兜底：无论发生什么，返回错误卡片
    console.error(e);
    return [createErrorCard("系统错误", e.message)];
  }
}

// =======================================================
// 3. 分支逻辑：获取 Trakt 数据
// =======================================================

async function fetchTraktTrending(type) {
  // Trakt API: shows/trending 或 movies/trending
  // map: tv -> shows, movie -> movies
  const traktType = type === "tv" ? "shows" : "movies";
  const url = `https://api.trakt.tv/${traktType}/trending?limit=20&extended=full`;

  const headers = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": TRAKT_CLIENT_ID
  };

  try {
    const res = await Widget.http.get(url, { headers: headers });
    
    // 解析 JSON (兼容处理)
    let data = res.body || res.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch(e) { throw new Error("Trakt 数据解析失败"); }
    }

    if (!Array.isArray(data)) {
      return [createErrorCard("Trakt 异常", "返回数据不是数组")];
    }

    // 格式化数据
    return data.map(item => {
      // Trakt Trending 返回结构是 { watchers: 123, movie: { ... } }
      const core = item[traktType.slice(0, -1)]; // movie 或 show
      const tmdbId = core.ids.tmdb; // 关键：获取 TMDB ID

      return {
        id: `trakt_${core.ids.trakt}`,
        // 只有拿到 TMDB ID，才能在 App 内点击跳转详情
        tmdbId: tmdbId || null, 
        type: tmdbId ? "tmdb" : "web", 
        mediaType: type, 
        
        title: core.title,
        subTitle: `🔥 ${item.watchers} 人正在看`,
        genreTitle: core.year ? String(core.year) : "",
        
        // Trakt 自身不返回图片，这里只能先暂时留空或者依赖 App 自动通过 TMDB ID 补全
        // 为了稳健，我们先不通过复杂的逻辑去查图，
        // 只有当 type="tmdb" 时，App 会尝试自动补全海报（取决于 App 版本）
        // 如果需要显示图片，后续版本我们可以加一步 TMDB 查图
        posterPath: "", 
        description: core.overview || "",
        
        url: `https://trakt.tv/${traktType}/${core.ids.slug}`
      };
    });

  } catch (e) {
    return [createErrorCard("Trakt 请求失败", e.message)];
  }
}

// =======================================================
// 4. 分支逻辑：获取流媒体数据 (TMDB)
// =======================================================

async function fetchStreamingHot(type, networkId) {
  // 使用 Forward 内置的 Widget.tmdb.get，自动处理 Key
  const endpoint = `/discover/${type}`;
  const params = {
    "with_networks": networkId,
    "sort_by": "popularity.desc",
    "vote_count.gte": "100", // 过滤掉太冷门的
    "language": "zh-CN",
    "page": "1"
  };

  try {
    const data = await Widget.tmdb.get(endpoint, { params: params });
    const results = data.results || [];

    if (results.length === 0) {
      return [createErrorCard("无数据", "该分类下暂时没有热门内容")];
    }

    return results.map(item => {
      const title = item.title || item.name;
      const orgTitle = item.original_title || item.original_name;
      
      return {
        id: String(item.id),
        tmdbId: item.id,
        type: "tmdb",
        mediaType: type,
        
        title: title,
        subTitle: orgTitle !== title ? orgTitle : "",
        genreTitle: item.vote_average ? `⭐${item.vote_average.toFixed(1)}` : "",
        
        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        description: item.overview || "暂无简介"
      };
    });

  } catch (e) {
    return [createErrorCard("TMDB 连接失败", "请检查网络设置或API Key")];
  }
}

// =======================================================
// 5. 辅助工具
// =======================================================

function createErrorCard(title, subTitle) {
  return {
    id: "error_card",
    type: "text", // 纯文本卡片，绝对安全
    title: `❌ ${title}`,
    subTitle: subTitle
  };
}
