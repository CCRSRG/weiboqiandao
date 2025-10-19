// ==================== 配置区域 ====================
// 请在这里填写你的微博 Cookie
// 浏览器打开https://m.weibo.cn/p/tabbar?containerid=100803_-_recentvisit
// 按F12打开开发者工具，登录-点击network-找到tabbar?containerid=100803_-_recentvisit 查看里面的cookie

const CONFIG = {
  
    SUB: "你的SUB_cookie值",
    SUBP: "你的SUBP值",
    _T_WM: "你的_T_WM值",
    
    // 签到延迟设置（毫秒），避免请求过快
    CHECKIN_DELAY: 1000,
    
    // 是否显示详细日志
    VERBOSE: true
  }
  
  // ==================== PushPlus 通知配置 ====================
  const PUSHPLUS_CONFIG = {
    // 是否启用 PushPlus 通知
    enabled: true,
    
    // PushPlus Token（从 https://www.pushplus.plus/ 获取）
    token: "你的PushPlus_Token",
    
    // PushPlus API 地址
    url: "https://www.pushplus.plus/send/"
  }
  
  // ==================== 请求头配置 ====================
  const HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "Connection": "keep-alive",
    "MWeibo-Pwa": "1",
    "Referer": "https://m.weibo.cn/p/tabbar?containerid=100803_-_recentvisit&page_type=tabbar",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0"
  }
  
  // ==================== 全局变量 ====================
  let stats = {
    totalTopics: 0,      // 总超话数量
    checkedInBefore: 0,  // 之前已签到
    newlyCheckedIn: 0,   // 本次新签到
    failedCheckin: 0     // 签到失败
  }
  
  // ==================== 工具函数 ====================
  
  /**
   * 日志输出函数
   */
  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const prefix = {
      'info': '[信息]',
      'success': '[成功]',
      'error': '[错误]',
      'warn': '[警告]'
    }[type] || '[信息]'
    
    console.log(`[${timestamp}] ${prefix} ${message}`)
  }
  
  /**
   * 发送 PushPlus 通知
   * @param {string} title - 通知标题
   * @param {string} content - 通知内容（支持 HTML 格式）
   */
  function sendPushPlusNotification(title, content) {
    if (!PUSHPLUS_CONFIG.enabled) {
      return
    }
    
    if (!PUSHPLUS_CONFIG.token || PUSHPLUS_CONFIG.token === "你的PushPlus_Token") {
      log('PushPlus Token 未配置，跳过通知', 'warn')
      return
    }
    
    try {
      const pushBody = {
        token: PUSHPLUS_CONFIG.token,
        title: title,
        content: content,
        template: "html" // 使用 HTML 模板，支持更丰富的格式
      }
      
      const pushResp = HTTP.post(
        PUSHPLUS_CONFIG.url,
        pushBody,
        {
          timeout: 15000,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
      
      if (pushResp.status === 200) {
        const result = pushResp.json()
        if (result.code === 200) {
          log('✅ PushPlus 通知发送成功', 'success')
        } else {
          log(`PushPlus 通知发送失败: ${result.msg || '未知错误'}`, 'warn')
        }
      } else {
        log(`PushPlus 通知发送失败，状态码: ${pushResp.status}`, 'warn')
      }
    } catch (error) {
      log(`发送 PushPlus 通知时出错: ${error.message || error}`, 'warn')
    }
  }
  
  /**
   * 延迟函数
   */
  function sleep(ms) {
    const start = Date.now()
    while (Date.now() - start < ms) {
      // 等待
    }
  }
  
  /**
   * 构建 Cookie 字符串
   */
  function buildCookieString() {
    const cookies = []
    if (CONFIG.SUB) cookies.push(`SUB=${CONFIG.SUB}`)
    if (CONFIG.SUBP) cookies.push(`SUBP=${CONFIG.SUBP}`)
    if (CONFIG._T_WM) cookies.push(`_T_WM=${CONFIG._T_WM}`)
    
    return cookies.join('; ')
  }
  
  /**
   * 验证 Cookie 是否有效
   */
  function verifyCookie() {
    log('正在验证 Cookie 有效性...')
    
    try {
      const cookieString = buildCookieString()
      const headers = Object.assign({}, HEADERS, {
        'Cookie': cookieString
      })
      
      const resp = HTTP.get('https://m.weibo.cn/api/config', {
        headers: headers,
        timeout: 10000
      })
      
      if (resp.status === 200) {
        const data = resp.json()
        if (data.data && data.data.login) {
          log('Cookie 验证成功，已登录', 'success')
          return true
        } else {
          log('Cookie 已过期或无效，请重新获取', 'error')
          return false
        }
      } else {
        log(`验证失败，状态码: ${resp.status}`, 'error')
        return false
      }
    } catch (e) {
      log(`验证 Cookie 时出错: ${e.message || e}`, 'error')
      return false
    }
  }
  
  /**
   * 获取关注的超话列表（支持分页）
   */
  function getSupertopicList() {
    const url = "https://m.weibo.cn/api/container/getIndex"
    const cookieString = buildCookieString()
    
    const headers = Object.assign({}, HEADERS, {
      'Cookie': cookieString
    })
    
    let allCards = []
    let pageCount = 1
    let sinceId = null
    
    try {
      while (true) {
        log(`正在获取第 ${pageCount} 页超话数据...`)
        
        // 构建请求 URL
        let requestUrl = `${url}?containerid=100803_-_followsuper`
        if (sinceId) {
          requestUrl += `&since_id=${sinceId}`
        }
        
        const resp = HTTP.get(requestUrl, {
          headers: headers,
          timeout: 10000
        })
        
        if (resp.status !== 200) {
          log(`获取第 ${pageCount} 页失败，状态码: ${resp.status}`, 'error')
          break
        }
        
        const data = resp.json()
        
        if (data.ok !== 1) {
          log(`第 ${pageCount} 页获取失败: ${data.msg || '未知错误'}`, 'error')
          break
        }
        
        if (data.data && data.data.cards) {
          const currentCards = data.data.cards
          allCards = allCards.concat(currentCards)
          log(`第 ${pageCount} 页获取成功，包含 ${currentCards.length} 个卡片`)
        } else {
          log(`第 ${pageCount} 页没有数据`)
          break
        }
        
        // 检查是否有下一页
        const cardlistInfo = data.data.cardlistInfo || {}
        sinceId = cardlistInfo.since_id
        
        if (!sinceId) {
          log('已到达最后一页')
          break
        }
        
        pageCount++
        sleep(500) // 延迟 500ms
      }
      
      log(`总共获取了 ${pageCount} 页数据，包含 ${allCards.length} 个卡片`, 'success')
      return allCards
      
    } catch (e) {
      log(`获取超话列表失败: ${e.message || e}`, 'error')
      return null
    }
  }
  
  /**
   * 执行单个超话签到
   */
  function performCheckin(topicName, scheme) {
    try {
      if (!scheme.startsWith('/api/container/button')) {
        return false
      }
      
      const fullUrl = `https://m.weibo.cn${scheme}`
      const cookieString = buildCookieString()
      
      const headers = Object.assign({}, HEADERS, {
        'Cookie': cookieString
      })
      
      const resp = HTTP.get(fullUrl, {
        headers: headers,
        timeout: 10000
      })
      
      if (resp.status === 200) {
        const result = resp.json()
        if (result.ok === 1) {
          if (result.data && result.data.msg) {
            const msg = result.data.msg
            if (msg.indexOf('成功') !== -1 || msg.indexOf('签到') !== -1) {
              return true
            }
          }
          return true
        } else {
          return false
        }
      } else {
        return false
      }
    } catch (e) {
      if (CONFIG.VERBOSE) {
        log(`签到 ${topicName} 时出错: ${e.message || e}`, 'error')
      }
      return false
    }
  }
  
  /**
   * 处理超话卡片并执行签到
   */
  function processSupertopics(cards) {
    log('\n========== 开始处理超话签到 ==========\n')
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      
      if (!card.card_group) {
        continue
      }
      
      for (let j = 0; j < card.card_group.length; j++) {
        const groupItem = card.card_group[j]
        
        if (!groupItem.title_sub || !groupItem.buttons) {
          continue
        }
        
        stats.totalTopics++
        const topicName = groupItem.title_sub
        const desc1 = groupItem.desc1 || ''
        
        // 检查按钮状态
        let canCheckin = false
        let checkinScheme = null
        let buttonStatus = "未知"
        
        for (let k = 0; k < groupItem.buttons.length; k++) {
          const button = groupItem.buttons[k]
          
          if (button.name) {
            const buttonName = button.name
            
            if (buttonName === '签到') {
              canCheckin = true
              checkinScheme = button.scheme || ''
              buttonStatus = "可签到"
              break
            } else if (buttonName === '已签' || buttonName === '已签到' || buttonName === '明日再来') {
              stats.checkedInBefore++
              buttonStatus = "已签到"
              log(`✓ ${topicName} - 今日已签到 (${desc1})`)
              break
            }
          }
        }
        
        // 执行签到
        if (canCheckin && checkinScheme) {
          const success = performCheckin(topicName, checkinScheme)
          
          if (success) {
            stats.newlyCheckedIn++
            log(`✓ ${topicName} - 签到成功 (${desc1})`, 'success')
          } else {
            stats.failedCheckin++
            log(`✗ ${topicName} - 签到失败 (${desc1})`, 'error')
          }
          
          // 添加延迟，避免请求过快
          sleep(CONFIG.CHECKIN_DELAY)
        }
      }
    }
  }
  
  /**
   * 显示统计信息
   */
  function showStatistics() {
    const completionRate = ((stats.checkedInBefore + stats.newlyCheckedIn) / Math.max(stats.totalTopics, 1) * 100).toFixed(1)
    
    log('\n========== 签到完成统计 ==========')
    log(`总共关注超话: ${stats.totalTopics} 个`)
    log(`之前已签到: ${stats.checkedInBefore} 个`)
    log(`本次新签到: ${stats.newlyCheckedIn} 个`, 'success')
    log(`签到失败: ${stats.failedCheckin} 个`, stats.failedCheckin > 0 ? 'warn' : 'info')
    log(`总签到完成率: ${completionRate}%`)
    log('===================================\n')
    
    // 发送 PushPlus 通知
    const notificationTitle = `微博超话签到完成 ✅`
    const notificationContent = `
      <h2>📊 签到统计</h2>
      <ul>
        <li>🔢 总关注超话: <b>${stats.totalTopics}</b> 个</li>
        <li>✅ 之前已签到: <b>${stats.checkedInBefore}</b> 个</li>
        <li>🎉 本次新签到: <b style="color: green;">${stats.newlyCheckedIn}</b> 个</li>
        <li>❌ 签到失败: <b style="color: ${stats.failedCheckin > 0 ? 'red' : 'gray'};">${stats.failedCheckin}</b> 个</li>
        <li>📈 总签到完成率: <b style="color: ${parseFloat(completionRate) >= 90 ? 'green' : 'orange'};">${completionRate}%</b></li>
      </ul>
      <hr>
      <p style="color: gray; font-size: 12px;">签到时间: ${new Date().toLocaleString('zh-CN')}</p>
    `
    
    sendPushPlusNotification(notificationTitle, notificationContent)
  }
  
  /**
   * 仅分析超话状态（不执行签到）
   */
  function analyzeSupertopics(cards) {
    log('\n========== 开始分析超话状态 ==========\n')
    
    let totalTopics = 0
    let checkedIn = 0
    let canCheckin = 0
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      
      if (!card.card_group) {
        continue
      }
      
      for (let j = 0; j < card.card_group.length; j++) {
        const groupItem = card.card_group[j]
        
        if (!groupItem.title_sub || !groupItem.buttons) {
          continue
        }
        
        totalTopics++
        const topicName = groupItem.title_sub
        const desc1 = groupItem.desc1 || ''
        
        let buttonStatus = "未知"
        
        for (let k = 0; k < groupItem.buttons.length; k++) {
          const button = groupItem.buttons[k]
          
          if (button.name) {
            const buttonName = button.name
            
            if (buttonName === '签到') {
              buttonStatus = "可签到"
              canCheckin++
            } else if (buttonName === '已签到' || buttonName.indexOf('已签') !== -1) {
              buttonStatus = "已签到"
              checkedIn++
            } else if (buttonName === '明日再来') {
              buttonStatus = "今日已签到"
              checkedIn++
            }
          }
        }
        
        log(`${topicName} - ${buttonStatus} (${desc1})`)
      }
    }
    
    const completionRate = (checkedIn / Math.max(totalTopics, 1) * 100).toFixed(1)
    
    log('\n========== 分析结果统计 ==========')
    log(`总共关注超话: ${totalTopics} 个`)
    log(`今日已签到: ${checkedIn} 个`)
    log(`可以签到: ${canCheckin} 个`)
    log(`签到完成率: ${completionRate}%`)
    log('=================================\n')
    
    // 发送 PushPlus 通知
    const notificationTitle = `微博超话状态分析 📊`
    const notificationContent = `
      <h2>📈 分析结果</h2>
      <ul>
        <li>🔢 总关注超话: <b>${totalTopics}</b> 个</li>
        <li>✅ 今日已签到: <b style="color: green;">${checkedIn}</b> 个</li>
        <li>⏰ 可以签到: <b style="color: orange;">${canCheckin}</b> 个</li>
        <li>📊 签到完成率: <b style="color: ${parseFloat(completionRate) >= 90 ? 'green' : 'orange'};">${completionRate}%</b></li>
      </ul>
      <hr>
      <p style="color: gray; font-size: 12px;">分析时间: ${new Date().toLocaleString('zh-CN')}</p>
    `
    
    sendPushPlusNotification(notificationTitle, notificationContent)
  }
  
  // ==================== 主函数 ====================
  
  /**
   * 主执行函数 - 自动签到模式
   */
  function autoCheckin() {
    log('========== 微博超话自动签到工具 ==========\n')
    
    try {
      // 检查配置
      if (!CONFIG.SUB || CONFIG.SUB === "你的SUB_cookie值") {
        const errorMsg = '错误：请先在脚本配置区域填写你的 SUB Cookie！'
        log(errorMsg, 'error')
        log('获取方法：', 'warn')
        log('1. 在浏览器中登录微博 https://m.weibo.cn', 'warn')
        log('2. 按 F12 打开开发者工具', 'warn')
        log('3. 切换到 Application -> Cookies', 'warn')
        log('4. 找到 SUB 字段，复制其值', 'warn')
        log('5. 粘贴到脚本配置区域的 SUB 字段中', 'warn')
        
        sendPushPlusNotification(
          '微博超话签到失败 ❌',
          `<p style="color: red;">${errorMsg}</p><p>请配置 SUB Cookie 后重试</p>`
        )
        return
      }
      
      // 验证 Cookie
      if (!verifyCookie()) {
        const errorMsg = 'Cookie 验证失败，请检查 Cookie 是否正确或已过期'
        log(errorMsg, 'error')
        
        sendPushPlusNotification(
          '微博超话签到失败 ❌',
          `<p style="color: red;">${errorMsg}</p><p>请重新获取有效的 Cookie</p>`
        )
        return
      }
      
      // 获取超话列表
      const cards = getSupertopicList()
      
      if (!cards || cards.length === 0) {
        const errorMsg = '未获取到超话数据，请检查网络连接或 Cookie 是否有效'
        log(errorMsg, 'error')
        
        sendPushPlusNotification(
          '微博超话签到失败 ❌',
          `<p style="color: red;">${errorMsg}</p>`
        )
        return
      }
      
      // 执行签到
      processSupertopics(cards)
      
      // 显示统计
      showStatistics()
      
    } catch (error) {
      const errorMsg = `签到过程发生异常: ${error.message || error}`
      log(errorMsg, 'error')
      
      sendPushPlusNotification(
        '微博超话签到异常 ⚠️',
        `<p style="color: orange;">${errorMsg}</p>`
      )
    }
  }
  
  /**
   * 主执行函数 - 仅分析模式
   */
  function analyzeOnly() {
    log('========== 微博超话状态分析工具 ==========\n')
    
    // 检查配置
    if (!CONFIG.SUB || CONFIG.SUB === "你的SUB_cookie值") {
      log('错误：请先在脚本配置区域填写你的 SUB Cookie！', 'error')
      return
    }
    
    // 验证 Cookie
    if (!verifyCookie()) {
      log('Cookie 验证失败，请检查 Cookie 是否正确或已过期', 'error')
      return
    }
    
    // 获取超话列表
    const cards = getSupertopicList()
    
    if (!cards || cards.length === 0) {
      log('未获取到超话数据，请检查网络连接或 Cookie 是否有效', 'error')
      return
    }
    
    // 分析状态
    analyzeSupertopics(cards)
  }
  
  // ==================== 执行入口 ====================
  
  // 默认执行自动签到
  // 如果只想分析状态不签到，请将下面这行注释掉，并取消下面 analyzeOnly() 的注释
  autoCheckin()
  
  // 仅分析模式（不执行签到）
  // analyzeOnly()
  
  