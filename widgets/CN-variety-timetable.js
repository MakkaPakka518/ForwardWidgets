WidgetMetadata = {
  id: "variety.strict.check",
  title: "国产综艺时刻表",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "显示当天更新的国产综艺",
  version: "2.1.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "综艺更新",
      functionName: "loadVarietySchedule",
      type: "list",
      requiresWebView: false,
      params: [
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "必须填写",
        },
        {
          name: "mode",
          title: "查看时间",
          type: "enumeration",
          value: "today",
          enumOptions: [
            { title: "今日更新 (Today)", value: "today" },
            { title: "明日预告 (Tomorrow)", value: "tomorrow" }
          ]
        }
      ]
    }
  ]
};

async function loadVarietySchedule(params = {}) {
  const apiKey = params.apiKey;
  if (!apiKey) return [{ id: "err", title: "❌ 请填写 API Key", type: "text" }];

  const mode = params.mode || "today";
  const targetDate = getDateStr(mode); // 获取 "2026-01-27"
  
  console.log(`[Variety] Target Date: ${targetDate}`);

  // 1. 宽泛查询 (Broad Search)
  // 为了不漏掉数据，我们在 API 层面放宽一点点 (查昨天到明天)
  // 然后在本地做严格过滤
  const searchStart = getDateShift(targetDate, -1);
  const searchEnd = getDateShift(targetDate, 1);

  const url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=zh-CN&sort_by=popularity.desc&include_null_first_air_dates=false&page=1&timezone=Asia/Shanghai&with_origin_country=CN&with_genres=10764|10767&air_date.gte=${searchStart}&air_date.lte=${searchEnd}`;

  try {
    const res = await Widget.http.get(url);
    const data = res.data || res;

    if (!data.results || data.results.length === 0) {
      return [{ id: "empty", title: "💤 暂无综艺更新", subTitle: `日期: ${targetDate}`, type: "text" }];
    }

    // 2. 严格校验 (Strict Validation)
    // 必须并发查询每一部剧的详情，确认 episode.air_date === targetDate
    const promises = data.results.map(async (show) => {
        return await validateShow(show, apiKey, targetDate);
    });

    const validItems = (await Promise.all(promises)).filter(item => item !== null);

    if (validItems.length === 0) {
      return [{ id: "empty_strict", title: "💤 今日无综艺更新", subTitle: "经核对，候选列表中的综艺今日均无排期", type: "text" }];
    }

    return validItems;

  } catch (e) {
    return [{ id: "err_net", title: "网络错误", subTitle: e.message, type: "text" }];
  }
}

// ==========================================
// 核心校验逻辑
// ==========================================
async function validateShow(show, apiKey, targetDate) {
    const detailUrl = `https://api.themoviedb.org/3/tv/${show.id}?api_key=${apiKey}&language=zh-CN`;
    
    try {
        const res = await Widget.http.get(detailUrl);
        const detail = res.data || res;
        
        let validEpisode = null;

        // 逻辑：不管是 "上一集" 还是 "下一集"，只要它的日期等于 targetDate，就是我们要找的
        
        if (detail.last_episode_to_air && detail.last_episode_to_air.air_date === targetDate) {
            validEpisode = detail.last_episode_to_air;
        } 
        else if (detail.next_episode_to_air && detail.next_episode_to_air.air_date === targetDate) {
            validEpisode = detail.next_episode_to_air;
        }

        if (validEpisode) {
            return {
                id: String(show.id),
                tmdbId: parseInt(show.id),
                type: "tmdb",
                mediaType: "tv",
                
                title: show.name,
                // 显示具体的集数信息
                subTitle: `🆕 S${validEpisode.season_number}E${validEpisode.episode_number}: ${validEpisode.name || "第" + validEpisode.episode_number + "期"}`,
                
                posterPath: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : "",
                backdropPath: show.backdrop_path ? `https://image.tmdb.org/t/p/w780${show.backdrop_path}` : "",
                rating: show.vote_average ? show.vote_average.toFixed(1) : "0.0",
                year: (show.first_air_date || "").substring(0, 4),
                description: `播出日期: ${validEpisode.air_date}`
            };
        }
    } catch (e) {}
    
    return null; // 日期不匹配，扔掉
}

// ==========================================
// 日期工具
// ==========================================
function getDateStr(mode) {
    const d = new Date();
    // 强制转换为东八区 (北京时间)
    // 避免因为手机系统时区设置不同导致的日期偏差
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

function getDateShift(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}
