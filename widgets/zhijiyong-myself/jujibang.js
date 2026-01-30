WidgetMetadata = {
  id: "gemini.platform.originals.v2.4",
  title: "流媒体·独家原创 (纯净版)",
  author: "Gemini & Makkapakka",
  description: "v2.4: UI重制。严格遵循【日期+集数+题材】格式 (如 01-31 S01E04 科幻)；去除表情符号。",
  version: "2.4.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "独家原创 & 追更日历",
      functionName: "loadPlatformOriginals",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. 平台选择
        {
          name: "network",
          title: "出品平台",
          type: "enumeration",
          value: "213",
          enumOptions: [
            { title: "Netflix (网飞)", value: "213" },
            { title: "HBO (Max)", value: "49" },
            { title: "Apple TV+", value: "2552" },
            { title: "Disney+", value: "2739" },
            { title: "Amazon Prime", value: "1024" },
            { title: "Hulu", value: "453" },
            { title: "Peacock", value: "3353" },
            { title: "Paramount+", value: "4330" },
            { title: "腾讯视频", value: "2007" },
            { title: "爱奇艺", value: "1330" },
            { title: "Bilibili (B站)", value: "1605" },
            { title: "优酷视频", value: "1419" },
            { title: "芒果TV", value: "1631" },
            { title: "TVING (韩)", value: "4096" }
          ],
        },
        // 2. 内容类型
        {
          name: "contentType",
          title: "内容类型",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "📺 剧集 (默认)", value: "tv" },
            { title: "🎬 电影", value: "movie" },
            { title: "🌸 动漫/动画", value: "anime" },
            { title: "🎤 综艺/真人秀", value: "variety" }
          ]
        },
        // 3. 排序与功能
        {
          name: "sortBy",
          title: "排序与功能",
          type: "enumeration",
          value: "popularity.desc",
          enumOptions: [
            { title: "🔥 综合热度", value: "popularity.desc" },
            { title: "⭐ 最高评分", value: "vote_average.desc" },
            { title: "🆕 最新首播", value: "first_air_date.desc" },
            { title: "📅 按更新时间 (追更模式)", value: "next_episode" },
            { title: "📆 今日播出 (每日榜单)", value: "daily_airing" }
          ],
        },
        // 4. 页码
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ],
    },
  ],
};

// ==========================================
// 常量定义
// ==========================================
const TRAKT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const TRAKT_API_BASE = "https://api.trakt.tv";

// 题材 ID 映射表 (TMDB ID -> 中文)
const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "政治", 37: "西部", 28: "动作", 12: "冒险", 14: "奇幻", 
    878: "科幻", 27: "恐怖", 10749: "爱情", 53: "惊悚", 10752: "战争"
};

async function loadPlatformOriginals(params) {
  const networkId = params.network || "213";
  const contentType = params.contentType || "tv";
  const sortBy = params.sortBy || "popularity.desc";
  const page = params.page || 1;

  // === 1. 构建 TMDB 查询参数 ===
  let endpoint = "/discover/tv";
  let queryParams = {
      with_networks: networkId,
      language: "zh-CN",
      include_null_first_air_dates: false,
      page: page
  };

  if (contentType === "movie") {
    endpoint = "/discover/movie";
    if (sortBy === "first_air_date.desc") queryParams.sort_by = "release_date.desc";
    else if (sortBy === "next_episode" || sortBy === "daily_airing") queryParams.sort_by = "popularity.desc"; 
    else queryParams.sort_by = sortBy;
    
  } else {
    // TV 类 (剧集/动漫/综艺)
    if (contentType === "anime") queryParams.with_genres = "16"; 
    else if (contentType === "variety") queryParams.with_genres = "10764|10767"; 

    if (sortBy === "daily_airing") {
        const today = new Date();
        const dateStr = today.toISOString().split("T")[0]; 
        queryParams["air_date.gte"] = dateStr;
        queryParams["air_date.lte"] = dateStr;
        queryParams.sort_by = "popularity.desc";
    } else if (sortBy === "next_episode") {
        queryParams.sort_by = "popularity.desc";
    } else {
        if (sortBy.includes("vote_average")) queryParams["vote_count.gte"] = 100;
        queryParams.sort_by = sortBy;
    }
  }

  try {
    const res = await Widget.tmdb.get(endpoint, { params: queryParams });
    const items = res?.results || [];

    if (items.length === 0) {
      return page === 1 ? [{ title: "暂无数据", subTitle: "尝试切换类型或平台", type: "text" }] : [];
    }

    // === 2. 数据处理与增强 (核心逻辑) ===
    
    // 判断是否是需要查具体的“更新模式”
    const isUpdateMode = (contentType !== "movie" && (sortBy === "next_episode" || sortBy === "daily_airing"));
    // 限制数量，防止请求 Trakt 过多
    const processCount = isUpdateMode ? 12 : 20;

    const enrichedItems = await Promise.all(items.slice(0, processCount).map(async (item) => {
        let episodeInfo = null;
        let sortDate = "1900-01-01"; // 默认排序日期

        // 基础日期 (保底)
        sortDate = item.first_air_date || item.release_date || "2099-01-01";

        if (isUpdateMode) {
             // 优先从 Trakt 获取精准集数信息
             const tData = await getTraktEpisodeInfo(item.id);
             if (tData) {
                 episodeInfo = tData;
                 sortDate = tData.air_date; 
             }
        }

        return {
            ...item,
            _epInfo: episodeInfo,
            _sortDate: sortDate
        };
    }));

    // === 3. 本地排序 (基于具体的播出时间) ===
    let finalItems = enrichedItems;
    
    if (sortBy === "next_episode" && contentType !== "movie") {
        finalItems.sort((a, b) => {
            const dateA = new Date(a._sortDate).getTime();
            const dateB = new Date(b._sortDate).getTime();
            
            // 逻辑：有待播集的排前面 (Next > Last)
            const typeA = a._epInfo?.type || 'none';
            const typeB = b._epInfo?.type || 'none';

            if (typeA === 'next' && typeB === 'next') return dateA - dateB; // 都在未来，近的在前
            if (typeA === 'next' && typeB !== 'next') return -1; // A未来，B过去，A前
            if (typeA !== 'next' && typeB === 'next') return 1;  // A过去，B未来，B前
            
            return dateB - dateA; // 都是过去，新的在前
        });
    }

    return finalItems.map(item => buildCard(item, contentType, sortBy));

  } catch (e) {
    return [{ title: "请求失败", subTitle: e.message, type: "text" }];
  }
}

// === Trakt API: 获取下一集或上一集 ===
async function getTraktEpisodeInfo(tmdbId) {
    try {
        const headers = {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": TRAKT_CLIENT_ID
        };

        // 1. 优先查下一集 (Next Episode)
        let nextRes = null;
        try {
            nextRes = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/next_episode?extended=full`, { headers });
        } catch(e) {}

        if (nextRes && nextRes.status === 200) {
            const data = JSON.parse(nextRes.body || nextRes.data);
            return { ...data, type: 'next', air_date: data.first_aired };
        }

        // 2. 没下一集查上一集 (Last Episode)
        let lastRes = null;
        try {
            lastRes = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/last_episode?extended=full`, { headers });
        } catch(e) {}

        if (lastRes && lastRes.status === 200) {
            const data = JSON.parse(lastRes.body || lastRes.data);
            return { ...data, type: 'last', air_date: data.first_aired };
        }

        return null;
    } catch (e) {
        return null;
    }
}

function buildCard(item, contentType, sortBy) {
    const isMovie = contentType === "movie";
    
    // 图片
    let imagePath = "";
    if (item.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${item.backdrop_path}`;
    else if (item.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${item.poster_path}`;

    // === 工具：格式化日期 MM-DD ===
    const formatShortDate = (str) => {
        if (!str) return "";
        const date = new Date(str);
        if (isNaN(date.getTime())) return str;
        return `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
    };

    // === 工具：获取题材 ===
    const getGenreName = (ids) => {
        if (!ids || ids.length === 0) return "";
        return GENRE_MAP[ids[0]] || ""; // 只取第一个，保持简洁
    };

    let subTitle = "";
    let genreTitle = "";

    // === UI 逻辑：严格按照 "01-31 S01E04 科幻" 格式 ===
    if (!isMovie && (sortBy === "next_episode" || sortBy === "daily_airing") && item._epInfo) {
        const ep = item._epInfo;
        const dateStr = formatShortDate(ep.air_date);
        const epStr = `S${String(ep.season).padStart(2,'0')}E${String(ep.number).padStart(2,'0')}`;
        const genreName = getGenreName(item.genre_ids);
        
        // 核心字符串构建：无表情，空格分隔
        const infoString = `${dateStr} ${epStr} ${genreName}`;

        subTitle = infoString;
        genreTitle = infoString; // 右上角也显示完全一致的信息
    } else {
        // 普通模式 / 电影 / 无集数数据
        const year = (item.release_date || item.first_air_date || "").substring(0, 4);
        const rating = item.vote_average ? `${item.vote_average.toFixed(1)}分` : "";
        const genreName = getGenreName(item.genre_ids);
        
        // 保持简洁，无表情
        if (isMovie) {
            subTitle = `${year} ${genreName} ${rating}`;
        } else {
            subTitle = `${year} ${genreName} ${rating}`;
        }
        genreTitle = year;
    }

    return {
        id: String(item.id),
        tmdbId: parseInt(item.id),
        type: "tmdb",
        mediaType: isMovie ? "movie" : "tv",
        title: item.name || item.title || item.original_name,
        subTitle: subTitle,
        genreTitle: genreTitle,
        description: item.overview || "暂无简介",
        posterPath: imagePath
    };
}
