const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanJson, cleanDelimitedCourses } = require('../server.cjs')

test('imports a traditional weekly grid with periods and teaching weeks', () => {
  const courses = cleanJson(JSON.stringify({ courses: [
    { title: '数据结构', teacher: '周老师', place: 'A-302', weekday: 1, sessions: '1-2节', weeks: '1-16周' },
    { title: '大学英语', teacher: 'Lin', place: 'B-204', weekday: 4, sessions: '7-8节', weeks: '1-15周(单)' }
  ] }))

  assert.equal(courses.length, 2)
  assert.deepEqual(courses[0], {
    id: 'ai-1', title: '数据结构', teacher: '周老师', place: 'A-302', weekday: 1,
    sessions: '1-2节', weeks: '1-16周', date: '', startTime: '', endTime: ''
  })
})

test('imports a timetable that provides exact start and end times', () => {
  const courses = cleanJson(JSON.stringify({ courses: [
    { title: 'Linear Algebra', teacher: 'Dr. Chen', place: 'Room 401', weekday: 2, weeks: '1-12', startTime: '09:30', endTime: '11:05' }
  ] }))

  assert.equal(courses.length, 1)
  assert.equal(courses[0].sessions, '')
  assert.equal(courses[0].startTime, '09:30')
  assert.equal(courses[0].endTime, '11:05')
})

test('imports a date-based course list without a recurring weekday', () => {
  const courses = cleanJson(JSON.stringify({ courses: [
    { title: '实验安全培训', teacher: '实验中心', place: '实训楼', date: '2026-10-14', startTime: '14:30', endTime: '16:00' }
  ] }))

  assert.equal(courses.length, 1)
  assert.equal(courses[0].date, '2026-10-14')
  assert.ok(Number.isNaN(courses[0].weekday))
})

test('accepts line-delimited JSON used by the retry parser', () => {
  const courses = cleanDelimitedCourses(`BEGIN_COURSES
{"title":"设计基础","teacher":"王老师","place":"艺术楼","weekday":5,"sessions":"3-4节","weeks":"2-14周","startTime":"10:10","endTime":"11:45"}
END_COURSES`)

  assert.equal(courses.length, 1)
  assert.equal(courses[0].sessions, '3-4节')
  assert.equal(courses[0].startTime, '')
})

test('drops incomplete rows instead of inventing schedule data', () => {
  const courses = cleanJson(JSON.stringify({ courses: [
    { title: '只有课程名' },
    { title: '缺少时间', weekday: 3 },
    { title: '有效课程', weekday: 3, sessions: '5-6节', weeks: '1-8周' }
  ] }))

  assert.equal(courses.length, 1)
  assert.equal(courses[0].title, '有效课程')
})
