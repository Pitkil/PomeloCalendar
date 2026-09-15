import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { CookieJar } from '../src/cookie-jar.mjs'
import { encryptCredential, normalizeCourse, validateScheduleInput } from '../src/official-swu.mjs'
import { createServer } from '../server.mjs'

describe('course normalization', () => {
  it('maps official SWU fields to the frontend contract', () => {
    assert.deepEqual(normalizeCourse({
      kch_id: 'SE101', kcmc: '软件工程', xm: '张老师', cdmc: '第八教学楼 105',
      xqj: '3', jc: '5-6节', zcd: '1-16周', xqmc: '北碚校区', xf: '3.0'
    }), {
      id: 'SE101', course_id: 'SE101', title: '软件工程', teacher: '张老师',
      place: '第八教学楼 105', weekday: 3, sessions: '5-6节', weeks: '1-16周',
      campus: '北碚校区', className: '', credit: '3.0'
    })
  })
})

describe('request validation', () => {
  it('accepts a valid schedule request', () => {
    assert.equal(validateScheduleInput({ username: '20231234', password: 'secret', year: 2026, term: 1 }).term, 1)
  })

  it('rejects an invalid term', () => {
    assert.throws(
      () => validateScheduleInput({ username: '20231234', password: 'secret', year: 2026, term: 3 }),
      (error) => error.code === 'INVALID_TERM' && error.status === 400
    )
  })
})

describe('official DES sandbox', () => {
  it('evaluates strEnc without exposing host globals', () => {
    const source = 'function strEnc(data, key) { return (data + key).toUpperCase().replace(/[^0-9A-F]/g, "A") }'
    assert.match(encryptCredential(source, '12ab', 'cd34'), /^[0-9A-F]+$/)
  })
})

describe('cookie jar', () => {
  it('does not send a host-only cookie to another SWU host', () => {
    const jar = new CookieJar()
    jar.store('https://idm.swu.edu.cn/am/UI/Login', new Headers({ 'set-cookie': 'SESSION=test; Path=/; Secure' }))
    assert.equal(jar.header('https://idm.swu.edu.cn/am/next'), 'SESSION=test')
    assert.equal(jar.header('https://jw.swu.edu.cn/'), '')
  })
})

describe('HTTP API', () => {
  let server
  let baseUrl

  before(async () => {
    server = createServer({
      fetchSchedule: async (input) => ({ courses: [{ title: '测试课程' }], meta: { year: input.year, term: input.term } })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('reports health', async () => {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).provider, 'swu-official')
  })

  it('returns normalized API errors', async () => {
    const response = await fetch(`${baseUrl}/api/swu/schedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: '', year: 2026, term: 1 })
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'INVALID_USERNAME')
  })

  it('returns courses from the schedule service', async () => {
    const response = await fetch(`${baseUrl}/api/swu/schedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '20231234', password: 'secret', year: 2026, term: 1 })
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).courses[0].title, '测试课程')
  })
})
