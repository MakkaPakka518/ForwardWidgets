WidgetMetadata = {
  id: "variety.trakt.final",
  title: "国产综艺时刻表",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "利用 Trakt 精准获取今日更新的国产综艺",
  version: "1.0.3",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "综艺更新",
      functionName: "loadTraktVariety",
      type: "list",
      requiresWebView: false,
      params: [
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "用于获取海报",
        },
        {
          name: "mode",
          title: "查看时间",
          type: "enumeration",
          value: "today",
          enumOptions: [
            { title: "今日更新 (Today)", value: "today" },
            { title: "明日预告 (Tomorrow)", value: "tomorrow" },
            { title: "未来 7 天 (Next 7 Days)", value: "week" }
          ]
        },
        {
          name: "clientId",
          title: "Trakt Client ID (选填)",
          type: "input",
          description: "建议填入以防限流",
        }
      ]
    }
  ]
};

async function loadTraktVariety(params = {}) {
  const apiKey = params.apiKey;
  const clientId = params.clientId || "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

  if (!apiKey) {
    return [{ id: "err", title: "❌ 请填写 API Key", type: "text" }];
  }

  const mode = params.mode || "today";
  
  // 1. 计算日期
  // 我们依然按北京时间计算 "今天"，以确保请求的是国内观众理解的 "今天"
  const dateStr = getBeijingDate(mode);
  const days = mode === "week" ? 7 : 1;

  console.log(`[Trakt] Fetching CN Variety for: ${dateStr} (+${days} days)`);

  // 2. Trakt Calendar API (精准筛选)
  // countries=cn: 锁定中国大陆
  // genres=reality,game-show,talk-show: 锁定综艺三大类
  const url = `https://api.trakt.tv/calendars/all/shows/${dateStr}/${days}?countries=cn&genres=reality,game-show,talk-show`;

  try {
    const res = await Widget.http.get(url, {
        headers: {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": clientId
        }
    });

    const data = res.data || res;

    // 容错处理
    if (!Array.isArray(data)) {
        return [{ id: "err_trakt", title: "Trakt 连接失败", subTitle: "请检查网络或 Client ID", type: "text" }];
    }

    if (data.length === 0) {
        return [{ 
            id: "empty", 
            title: "💤 暂无更新", 
            subTitle: `Trakt 显示 ${dateStr} 无国产综艺排期`, 
            type: "text" 
        }];
    }

    // 3. 并发获取 TMDB 图片 (Trakt 不提供图片，必须转译)
    // Trakt 返回结构: [{ show: {...}, episode: {...} }, ...]
    const promises = data.map(async (item) => {
        const show = item.show;
        const episode = item.episode;
        
        // 必须要有 TMDB ID 才能跳转 Emby
        if (!show.ids || !show.ids.tmdb) return null;

        const tmdbId = show.ids.tmdb;
        const displayName = show.title; // Trakt 标题通常包含中文 (如果是国产剧)
        
        // 构建基础信息 (万一 TMDB 挂了，至少能显示文字)
        const resultItem = {
            id: String(tmdbId),
            tmdbId: parseInt(tmdbId),
            type: "tmdb",
            mediaType: "tv",
            title: displayName,
            subTitle: `🆕 S${episode.season}E${episode.number}: ${episode.title || "第" + episode.number + "期"}`,
            description: `播出时间: ${item.first_aired}`, // Trakt 的精确播出时间
            year: (show.year || "").toString(),
            posterPath: "",
            backdropPath: ""
        };

        // 去 TMDB 拿高清图
        try {
            const tmdbUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&language=zh-CN`;
            const tmdbRes = await Widget.http.get(tmdbUrl);
            const tmdbData = tmdbRes.data || tmdbRes;
            
            if (tmdbData) {
                if (tmdbData.poster_path) resultItem.posterPath = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
                if (tmdbData.backdrop_path) resultItem.backdropPath = `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}`;
                if (tmdbData.vote_average) resultItem.rating = tmdbData.vote_average.toFixed(1);
                // 优先使用 TMDB 的中文名 (如果 Trakt 给的是拼音或英文)
                if (tmdbData.name) resultItem.title = tmdbData.name;
            }
        } catch (e) {}

        return resultItem;
    });

    const finalItems = await Promise.all(promises);
    return finalItems.filter(r => r !== null);

  } catch (e) {
    return [{ id: "err_net", title: "网络错误", subTitle: e.message, type: "text" }];
  }
}

// ==========================================
// 日期工具 (强制北京时间)
// ==========================================
function getBeijingDate(mode) {
    const d = new Date();
    // UTC+8 转换
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const cnDate = new Date(utc + (3600000 * 8));

    if (mode === "tomorrow") {
        cnDate.setDate(cnDate.getDate() + 1);
    }
    
    const y = cnDate.getFullYear();
    const m = String(cnDate.getMonth() + 1).padStart(2, '0');
    const day = String(cnDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
