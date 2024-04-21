import { publicIpv4, publicIpv6 } from 'public-ip'
import fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import fastifyFormBody from '@fastify/formbody'
import websocket from '@fastify/websocket'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import artTemplate from 'art-template'
import YAML from 'yaml'

export async function Server() {
  /** 初始化配置文件 */
  try {
    fs.readFileSync('./config/config.yaml')
  } catch (checkcfg) {
    checkcfg = fs.copyFileSync('./config/defSet/defSet.yaml', './config/config.yaml')
  }
  try {
    fs.accessSync('./data/')
  } catch (checkdatadir) {
    checkdatadir = fs.mkdirSync('./data/')
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  let cfg = YAML.parse(fs.readFileSync(process.cwd() + '/config/config.yaml', 'utf8'))
  let tokens
  try {
    tokens = YAML.parse(fs.readFileSync(process.cwd() + '/config/token.yaml', 'utf8'))
  } catch {}
  /** 读取主页 */
  let content = fs.readFileSync('static/html/index.html', 'utf8')

  /** 开鸡！ */
  const server = fastify({
    logger: true,
  })
  server.listen(
    {
      port: cfg.Port,
      host: '::',
    },
    async function (err, address) {
      if (err) {
        fastify.log.error(err)
        process.exit(1)
      }
      console.log(`Geetest手动验证服务器正在监听 ${address}\n\n# API接口:\n[GET/POST] ${await GetIP()}/geetest`)
    }
  )
  /** 注册组件 */
  server.register(fastifyStatic, {
    root: join(__dirname),
    prefix: '/static',
  })
  server.register(fastifyMultipart, { addToBody: true })
  server.register(fastifyFormBody)
  server.register(websocket, {
    cors: true,
    options: {
      maxPayload: 1048576,
    },
  })

  // server.get('/ws', {
  //   websocket: true
  // })

  server.get('/', async (request, reply) => {
    /** 禁止访问根页面，302重定向到/geetest */
    reply.redirect(302, '/geetest')
  })

  server.get('/docs', async (request, reply) => {
    /** 禁止访问根页面，302重定向到/geetest */
    let content = fs.readFileSync('static/html/docs.html', 'utf8')
    reply.code(200).type('text/html').send(content)
  })

  /** 主页 */
  server.get('/geetest', async (request, reply) => {
    /** 获取url参数 */
    const { gt, challenge, callback, e } = request.query

    /** 填入参数 */
    if (gt && !challenge) {
      reply.code(403).send({
        retcode: 403,
        info: '传入参数不完整，缺少 challenge ',
        data: null,
      })
    }
    if (challenge && !gt) {
      reply.code(403).send({
        retcode: 403,
        info: '传入参数不完整，缺少 gt 。查询请把 challenge 值传入 callback 字段即可查询',
        data: null,
      })
    }
    if (gt && challenge) {
      content = content.replace('id="gt"', `id="gt" value="${gt}"`)
      content = content.replace('id="challenge"', `id="challenge" value="${challenge}"`)

      /** 通过challenge参数保存文件 */
      const data = {
        retcode: 204,
        info: '服务器支持[GET/POST]请求，传入 gt 和 challenge 值即可还原验证码，把 challenge 值传入 callback 字段可进行结果查询',
      }
      const fileName = `${challenge}.json`
      const filePath = path.join(__dirname, '..', 'data', fileName)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
      if (request.headers['accept'] === 'application/json') {
        reply.type('application/json').send(fileName)
      } else {
        reply.type('text/html').send(artTemplate.render(content, { copyright: cfg.copyright }))
      }
    }

    /** 回调地址 */
    if (callback) {
      const fileName = `${callback}.json`
      const filePath = path.join(__dirname, '..', 'data', fileName)

      try {
        /** 返回valite等参数 */
        const content = fs.readFileSync(filePath, 'utf8')
        const data = JSON.parse(content)
        if (!data.verified) data.data = undefined
        reply.type('application/json').send(data)
      } catch (err) {
        reply.type('application/json').send({
          retcode: 204,
          info: '未生成对应文件，请等待用户访问验证地址',
        })
      }
    }

    /** 短链转发 */
    if (e) {
      const token = request.query.e
      const valid = await verifyToken(token)
      const data = JSON.parse(fs.readFileSync(`./data/${e}.json`, 'utf8'))
      if (valid && !data.verified) {
        /** 读取data */
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${token}.json`), 'utf8'))

        /** 读取HTML模板文件 */
        const template = fs.readFileSync('static/html/jump.html', 'utf8')

        reply
          .code(200)
          .type('text/html')
          .send(
            artTemplate.render(template, {
              copyright: cfg.copyright,
              gt: data.geetest.gt,
              challenge: data.geetest.challenge,
            })
          )
      } else {
        /** e验证失败的响应 */
        const html = fs.readFileSync('static/html/old_token.html', 'utf8')
        reply
          .code(403)
          .type('text/html')
          .send(artTemplate.render(html, { copyright: cfg.copyright }))
      }
    }

    reply.type('text/html').send(artTemplate.render(content, { copyright: cfg.copyright }))
  })

  let targetUrl
  server.post('/geetest', async (request, reply) => {
    let { gt, challenge, url } = request.body
    const token = request.headers['authorization']

    const user = Object.keys(tokens).find((key) => tokens[key] === token)

    if (user && gt && challenge) {
      // console.log(`Token verified for user: ${user}`);
      let validate = await get_validate(gt, challenge)
      validate = validate.trim()
      if (validate === 'Authentication Failed') {
        await reply.code(401).type('application/json').send({
          geetest_gt: gt,
          geetest_challenge: challenge,
        })
      }
      const resultdata = {
        status: 0,
        message: 'OK',
        data: {
          geetest_gt: gt,
          geetest_challenge: challenge,
          geetest_validate: validate,
          geetest_seccode: validate + '|jordan',
        },
      }
      await reply.type('application/json').send(resultdata)
    } else if (gt && challenge && !url) {
      let link = `${cfg.Address}:${cfg.SSL ? cfg.SSL : cfg.Port}/geetest`
      targetUrl = `${link}?gt=${gt}&challenge=${challenge}`
      const token = CreateToken(4)

      /** 通过challenge参数保存文件 */
      const resultdata = {
        status: 0,
        message: 'OK',
        data: {
          link: `${link}?e=${token}`,
          result: `${link}?callback=${token}`,
        },
        geetest: {
          gt: gt,
          challenge: challenge,
        },
        e: decodeURIComponent(token),
        verified: false,
      }
      fs.writeFileSync(`./data/${decodeURIComponent(token)}.json`, JSON.stringify(resultdata, null, 4))
      reply.type('application/json').send(resultdata)
    }

    /** 返回短链token */
    if (url && !(gt, challenge)) {
      targetUrl = url
      const token = CreateToken(4)
      reply.type('application/json').send({
        status: 0,
        message: 'OK',
        data: {
          token,
        },
      })
    }
  })

  /** 读取文件 - 更新数据 - 写入文件 */
  server.post('/updateResult', (request, reply) => {
    const { res, e, verified } = request.body
    const headers = request.headers
    const filePath = `./data/${e}.json`

    /** 接受强制写入 */
    if (headers['force-write']) {
      const updatedData = {
        retcode: 200,
        data: {
          geetest_gt: res.gt,
          geetest_challenge: res.challenge,
          geetest_validate: res.validate,
          geetest_seccode: res.seccode,
        },
        geetest: {
          gt: res.gt,
          challenge: res.challenge,
        },
        e: e,
        verified: verified,
      }
      fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 4))
      return 'success'
    }

    /** 读取原文件 */
    let data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    /** 保存文件 */
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
    reply.send(data)
  })

  const tokenMap = {}
  function CreateToken(len) {
    let _charStr = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789',
      min = 0,
      max = _charStr.length - 1,
      _str = '' /** 定义随机字符串 变量 */
    /** 判断是否指定长度，否则默认长度为15 */
    len = len || 15
    /** 循环生成字符串 */
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

  /** 验证token有效性 */
  async function verifyToken(token) {
    const now = Date.now()
    const tokenData = tokenMap[token]

    if (!tokenData || now - tokenData.createTime > 240 * 1000) {
      /** 不存在或过期则无效 */
      return false
    }

    /** 有效 */
    return true
  }

  /** 读取配置文件 */
  async function GetIP() {
    if (cfg.Address !== '') {
      return `${cfg.Address}:${cfg.SSL ? cfg.SSL : cfg.Port}`
    } else {
      const ipv4 = await publicIpv4()
      return ipv4 ? `http://${ipv4}:${cfg.SSL ? cfg.SSL : cfg.Port}` : `http://[${await publicIpv6()}]:${cfg.SSL ? cfg.SSL : cfg.Port}`
    }
  }

  async function get_validate(gt, challenge) {
    return new Promise((resolve, reject) => {
      let outputData = ''
      const isWindows = process.platform === 'win32'

      let pythonCommand
      if (isWindows) {
        pythonCommand = 'python' // On Windows, use 'python' assuming it's in the PATH
      } else {
        // On Unix-like systems, first try 'python3', then 'python'
        const python3Command = 'python3'
        const pythonCommandFallback = 'python'

        try {
          // Try running 'python3' to see if it exists
          const python3Check = spawnSync('which', [python3Command], {
            stdio: 'pipe',
            encoding: 'utf-8',
          })
          if (python3Check.status === 0 && python3Check.stdout.trim() !== '') {
            pythonCommand = python3Check.stdout.trim()
          }
        } catch (error) {
          try {
            // If 'python3' is not available, try 'python'
            const pythonCheck = spawnSync('which', [pythonCommandFallback], {
              stdio: 'pipe',
              encoding: 'utf-8',
            })
            if (pythonCheck.status === 0 && pythonCheck.stdout.trim() !== '') {
              pythonCommand = pythonCheck.stdout.trim()
            }
          } catch (error) {
            try {
              pythonCommand = 'python3'
            } catch (error) {
              // Both 'python3' and 'python' are not available
              console.error('Error: Python not found on the system.')
              process.exit(1)
            }
          }
        }
      }
      const pythonProcess = spawn(pythonCommand, ['cache/app.py', gt, challenge])
      pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString()
      })

      pythonProcess.on('close', () => {
        const lines = outputData.split('\n')
        const validate = lines[lines.length - 2] // -2 因为最后一行可能是空行
        console.log('validate:', validate)
        resolve(validate)
      })

      pythonProcess.stderr.on('data', (data) => {
        reject(data.toString()) // 在发生错误时拒绝 Promise
      })
    })
  }
}
