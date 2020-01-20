const axios = require('axios')
const { ConcurrencyManager } = require('axios-concurrency')
const csv = require('csvtojson')
const rl = require('readline-sync')
const async = require('async')
const request = require('request')
const ProgressBar = require('progress')
const chalk = require('chalk')
const path = require('path')
const config = require('./config.js')
const inquirer = require('inquirer')
const fs = require('fs')
const ext = '.csv'

const puppeteer = require("puppeteer")

const MAX_CONCURRENT_REQUESTS = 3
const manager = ConcurrencyManager(axios, MAX_CONCURRENT_REQUESTS)

const fileList = fs.readdirSync("./", (err,files) => { return files })

const filteredList = fileList.filter(file => {
  return path.extname(file).toLowerCase() === ext
})

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

class Downloader {
  constructor() {
      this.q = async.queue(this.singleFile, 1);

      // assign a callback
      this.q.drain(function() {
          console.log('all items have been processed');
      });

      // assign an error callback
      this.q.error(function(err, task) {
          console.error('task experienced an error', task);
      });
  }

  downloadFiles(links) {
      for (let link of links) {
          this.q.push(link);
      }
  }

  singleFile(link, cb) {
      let file = request(link.url);
      let bar;
      file.on('response', (res) => {
          const len = parseInt(res.headers['content-length'], 10);
          console.log(formatBytes(len,2) + "      " + link.name);
          bar = new ProgressBar('  Downloading [:bar] :rate/bps :percent :etas', {
              complete: '=',
              incomplete: ' ',
              width: 20,
              total: len
          });
          file.on('data', (chunk) => {
              bar.tick(chunk.length);
          })
          file.on('end', () => {
              console.log('\n');
              cb();
          })
      })
      // console.log(link.name)
      file.pipe(fs.createWriteStream(`./${link.folder}/${link.name}`))
  }
}

inquirer
  .prompt([
    {
      type: "input",
      name: "domain",
      message: "What is the domain? "
    },
    {
      type: "list",
      name: "filePath",
      message:  "Please select your csv",
      choices: filteredList
    },
    {
      type: "input",
      name: "canvasUser",
      message: "Enter your Instructure username"
    },
    {
      type: "password",
      name: "canvasPass",
      message: "Enter your Instructure password (This is never saved)"
    }
  ])
  .then(async answers => {
    try{
      const list = await csv().fromFile(`./${answers.filePath}`);

      let courses = await Promise.all(list.map(async course => {
        return axios.get(`https://${answers.domain}.instructure.com/api/v1/courses/${course.canvas_course_id}`,{
          headers: {
            "Authorization": `Bearer ${config.token}`
          }
        })
        .then(response => {
          if (response.data.sis_course_id !== null || "") {
            return {
              name: response.data.sis_course_id,
              canvas_course_id: course.canvas_course_id
              }
            } else {
              return {
                name: response.data.name,
                canvas_course_id: course.canvas_course_id
              }
            }
        })
      }));


      (async function main(){
        const browser = await puppeteer.launch({
          // headless: false,
          // defaultViewport: null,
          // devtools: true
        })
        const page = await browser.newPage();
        await page.goto("https://instructure.okta.com/")
        //login flow

        await page.type('input[name=username]', answers.canvasUser, {delay:100})
        await page.type('input[name=password]', answers.canvasPass, {delay:100})
        await page.waitFor(2000)
        await page.click("#okta-signin-submit")

        await page.waitFor(2000)
        authCode = rl.question("Please enter your authenticator code: ")
        await page.type('input[name=answer]', authCode, {delay: 100})
        //put in logic so if the user put their password in wrong it'll ask for it again
        await page.click('input[value=Verify]')
        await page.waitFor(2000)
        await page.goto(`https://siteadmin.instructure.com/accounts/self`)
        await page.waitFor(2000)
        await page.goto(`https://${answers.domain}.instructure.com/accounts/self`)
        let files = []

        for (let course of courses) {
          try {
            await page.goto(`https://${answers.domain}.instructure.com/courses/${course.canvas_course_id}/gradebook_csv?grading_period_id=null`)
            console.log(`generating CSV for course ${course.canvas_course_id}`)
            responseText = await page.evaluate(() => {
              text = document.querySelector("body").innerText
              return JSON.parse(text.replace('while(1);',''))
            })
            responseObj = {
              attachment_id: responseText.attachment_id,
              course: course.canvas_course_id,
              folder: course.name
            }
            files.push(responseObj)
            await page.waitFor(250)
          } catch (e) {
            console.error(e)
          }
        }

        userId = await axios.get(`https://${answers.domain}.instructure.com/api/v1/users/self`,{
          headers: {
            "Authorization": `Bearer ${config.token}`
          }
        })
        .then(response => {
          return response.data.id
        })

        let downloadList = await Promise.all(files.map(async file => {
          return axios.get(`https://${answers.domain}.instructure.com/api/v1/users/${userId}/files/${file.attachment_id}`,{
            headers: {
              "Authorization": `Bearer ${config.token}`
            }
          })
          .then(response => {
            console.log(`compiling download urls for ${file.course}`)
            console.log("working")
            return {
              url:  response.data.url,
              name: response.data.filename,
              folder: file.folder
            }
          })
        }))
        const dl = new Downloader();
        dl.downloadFiles(downloadList)
      })()
  } catch (e) {
    console.error(e)
  }
})