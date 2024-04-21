window.onload = function () {
  const wait = document.querySelector('#wait')
  const genBtn = document.querySelector('#gen')
  const successBtn = document.querySelector('#success')
  const resultBox = document.querySelector('#result')
  const resultBtn = document.querySelector('#result-btn')
  const toastBox = document.querySelector('.toast-box')
  const testBtn = document.querySelector('#online-test')

  const gtInput = document.querySelector('#gt')
  const challengeInput = document.querySelector('#challenge')
  const validateInput = document.querySelector('#validate')
  const seccodeInput = document.querySelector('#seccode')

  gtInput.value = ''
  challengeInput.value = ''

  class GeeTest {
    constructor(gt, challenge) {
      this.gt = gt
      this.challenge = challenge
    }

    init(now = false) {
      initGeetest(
        {
          gt: this.gt,
          challenge: this.challenge,
          offline: false,
          new_captcha: true,

          product: now ? 'bind' : 'popup',
          width: '100%',
        },
        function (captchaObj) {
          if (now)
            setTimeout(() => {
              hide(wait)
              captchaObj.verify()
            }, Math.floor(Math.random() * 2000) + 1000)
          else captchaObj.appendTo('#captcha')

          captchaObj
            .onReady(() => {
              if (!now) hide(wait)
            })
            .onSuccess(() => {
              const result = captchaObj.getValidate()

              validateInput.value = result.geetest_validate
              seccodeInput.value = result.geetest_seccode

              // 触发获取焦点
              validateInput.dispatchEvent(new Event('focus'))
              validateInput.dispatchEvent(new Event('blur'))
              // 触发失去焦点
              seccodeInput.dispatchEvent(new Event('focus'))
              seccodeInput.dispatchEvent(new Event('blur'))

              validateInput.readOnly = true
              seccodeInput.readOnly = true
              try {
                const gt = gtInput.value
                const challenge = challengeInput.value
                const seccode = seccodeInput.value
                const validate = validateInput.value
                // 调用接口发送参数
                fetch(`${window.location.origin}/updateResult`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Force-Write': 'true',
                  },
                  body: JSON.stringify({
                    verified: true,
                    e: localStorage.getItem('e') || decodeURIComponent(CreateToken(4)),
                    res: { gt, challenge, validate, seccode },
                  }),
                }).then(() => {
                  localStorage.removeItem('gt')
                  localStorage.removeItem('challenge')
                  localStorage.removeItem('e')
                })
              } catch (err) {
                console.log(err)
              }

              showToastBox('验证成功！你现在可以关闭这个页面了')
              if (now) {
                hide(wait)
                show(successBtn)
                successBtn.setAttribute('data-status', 'success')
              }
              show(resultBox)
            })
            .onError((err) => {
              showToastBox('验证失败 ' + err.msg, 3000)
              if (now) {
                hide(wait)
                show(genBtn)
              }
            })
        }
      )
    }
  }

  testBtn.onclick = (e) => {
    const currentUrl = window.location.href
    if (currentUrl.includes('?')) {
      window.location.href = `${window.location.origin}/geetest`
      return
    }
    e.preventDefault()
    if (successBtn.getAttribute('data-status') === 'success') {
      // 重置属性
      successBtn.setAttribute('data-status', '')
      // 隐藏成功按钮
      hide(successBtn)
      // 显示开始验证按钮
      show(genBtn)
      hide(resultBox)
    }
    let randomNum
    const timestamp = Date.now().toString()
    const randomDigits = Math.floor(Math.random() * 10000000000)
    randomNum = timestamp + randomDigits.toString().padStart(11, '0')

    /** https://www.geetest.com/demo/gt/register-fullpage 一键通过 */
    /** https://www.geetest.com/demo/gt/register-icon 图案点选 */
    /** https://www.geetest.com/demo/gt/register-click 文字点选 */
    /** https://www.geetest.com/demo/gt/register-slide 滑块验证*/
    const baseUrl = 'https://www.geetest.com/demo/gt/register-fullpage'
    const url = `${baseUrl}?t=${randomNum}`
    challengeInput.value = ''
    challengeInput.dispatchEvent(new Event('focus'))
    challengeInput.dispatchEvent(new Event('blur'))

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        gtInput.value = data.gt
        challengeInput.value = data.challenge

        // 触发获取焦点
        gtInput.dispatchEvent(new Event('focus'))
        gtInput.dispatchEvent(new Event('blur'))
        // 触发失去焦点
        challengeInput.dispatchEvent(new Event('focus'))
        challengeInput.dispatchEvent(new Event('blur'))

        showToastBox('获取参数成功！请点击生成验证码')

        // fetch(`${window.location.origin}/geetest`, {
        //   method: "POST",
        //   headers: {
        //     "Content-Type": "application/json",
        //     "Force-Write": "true",
        //     authorization: "verification",
        //   },
        //   body: JSON.stringify(
        //     {
        //       gt: data.gt,
        //       challenge: data.challenge,
        //     },
        //     null,
        //     4
        //   ),
        // })
        //   .then((response) => {
        //     if (response.status === 401) {
        //       showToastBox("验证失败，服务器拒绝响应！");
        //     }
        //     return response.json();
        //   })
        //   .then((data) => {
        //     showToastBox(`验证成功！validate: ${data.data.geetest_validate}`);

        //     validateInput.value = data.data.geetest_validate;
        //     seccodeInput.value = data.data.geetest_validate + "|jordan";

        //     // 触发获取焦点
        //     validateInput.dispatchEvent(new Event("focus"));
        //     validateInput.dispatchEvent(new Event("blur"));
        //     // 触发失去焦点
        //     seccodeInput.dispatchEvent(new Event("focus"));
        //     seccodeInput.dispatchEvent(new Event("blur"));

        //     validateInput.readOnly = true;
        //     seccodeInput.readOnly = true;
        //     show(resultBox);
        //   });
        // showToastBox("正在自动验证 ~ ~ ~");
      })
      .catch((error) => {
        showToastBox('获取gt和challenge失败', error)
        console.error('获取gt和challenge失败', error)
      })
  }

  genBtn.onclick = () => {
    let gt = gtInput.value
    let challenge = challengeInput.value
    if (gt === undefined || gt === '' || challenge === undefined || challenge === '') {
      console.log('gt 和 challenge 不能为空')
      showToastBox('gt 和 challenge 不能为空', 3000)
      return
    }
    if (gt.length !== 32 || challenge.length !== 32) {
      console.log('gt 或 challenge 长度错误')
      showToastBox('gt 或 challenge 长度错误', 3000)
      return
    }

    hide(genBtn)
    show(wait)

    new GeeTest(gt, challenge).init(true)
  }

  const search = location.search

  if (search !== '') {
    hide(genBtn)
    show(wait)

    let gt = ''
    let challenge = ''

    const arr = search.substring(1).split('&')
    for (const i in arr) {
      const t = arr[i].split('=')
      switch (t[0]) {
        case 'gt':
          gt = t[1]
          break
        case 'challenge':
          challenge = t[1]
          break
        default:
          break
      }
    }
    if (gt !== '' && challenge !== '') {
      gtInput.value = gt
      challengeInput.value = challenge
      new GeeTest(gt, challenge).init()
    } else {
      console.log('未从URL中找到 gt 与 challenge')
      hide(wait)
      show(genBtn)
    }
  }

  resultBtn.onclick = () => {
    const text = 'validate=' + validateInput.value + '&seccode=' + seccodeInput.value
    const clipboard = navigator.clipboard
    if (clipboard === undefined) {
      const el = document.createElement('input')
      el.setAttribute('value', text)
      document.body.appendChild(el)
      el.select()
      const res = document.execCommand('copy')
      document.body.removeChild(el)
      showToastBox(res ? '复制成功' : '复制失败')
    } else
      clipboard.writeText(text).then(
        () => {
          console.log('复制成功')
          showToastBox('复制成功')
        },
        (err) => {
          console.log('复制失败')
          console.log(err)
          showToastBox('复制失败')
        }
      )
  }

  let timer = null
  function showToastBox(text, timeout = 2000) {
    toastBox.innerHTML = text
    toastBox.style.opacity = 1
    toastBox.style.top = '50px'
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => {
      toastBox.style.top = '-30px'
      toastBox.style.opacity = 0
    }, timeout)
  }

  function hide(el) {
    el.classList.add('hide')
  }

  function show(el) {
    el.classList.remove('hide')
  }
  const tokenMap = {}
  function CreateToken(len) {
    let _charStr = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789',
      min = 0,
      max = _charStr.length - 1,
      _str = '' //定义随机字符串 变量
    //判断是否指定长度，否则默认长度为15
    len = len || 15
    //循环生成字符串
    for (var i = 0, index; i < len; i++) {
      index = (function (randomIndexFunc, i) {
        return randomIndexFunc(min, max, i, randomIndexFunc)
      })(function (min, max, i, _self) {
        let indexTemp = Math.floor(Math.random() * (max - min + 1) + min),
          numStart = _charStr.length - 10
        if (i == 0 && indexTemp >= numStart) {
          indexTemp = _self(min, max, i, _self)
        }
        return indexTemp
      }, i)
      _str += _charStr[index]
      _str = btoa(_str)
    }
    tokenMap[_str] = {
      createTime: Date.now(),
    }

    return encodeURIComponent(_str)
  }
}
