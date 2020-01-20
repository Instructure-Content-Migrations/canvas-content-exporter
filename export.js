const axios = require('axios')
const { ConcurrencyManager } = require('axios-concurrency')
const FormData = require('form-data')
const csv = require('csvtojson')
const async = require('async')
const request = require('request')
const ProgressBar = require('progress')
const chalk = require('chalk')
const path = require('path')
const config = require('./config.js')
const inquirer = require('inquirer')
const fs = require('fs')
const mkdirp = require('mkdirp')
const ext = '.csv'

//TODO ADD LOGIC THAT CREATES COURSE FOLDERS BY NAME AND WITH THEIR COURSE ID

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

function triggerExport (answers,course) {
  axios
  .post(`https://${answers.domain}.instructure.com/api/v1/courses/${course.canvas_course_id}/content_exports?export_type=common_cartridge&skip_notifications=true`,{},{
    headers: {
      'Authorization': `Bearer ${config.token}`
    },
  })
  .then(response => {
    console.log("Export generated for " + course.canvas_course_id)
  })
  .catch(e => {
    console.error(e)
  })

  mkdirp(course.name, e => {
    if (e) console.error(e)
    else console.log(`Folder: ${course.name} created!`)
  })
}

function getUrls (answers, course) {
  // this function will be used to get all the most recent download URLs from a canvas course
  return axios
      .get(`https://${answers.domain}.instructure.com/api/v1/courses/${course.canvas_course_id}/content_exports`,{
        headers: {
          "Authorization": `Bearer ${config.token}`
        }
      })
      .then(response => {
        data = {
          url: response.data[0].attachment.url,
          name: response.data[0].attachment.filename
        }
        return data
      })
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
      type: "list",
      name: "choice",
      message:  "Do you want to trigger exports or download them",
      choices: ["Trigger exports", "Download them"]
    }
  ])
  .then(async answers => {
    try {
      const list = await csv().fromFile(`./${answers.filePath}`)

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
      }))

      if (answers.choice === "Trigger exports") {
      const courseData = courses.map(course => {
        console.log(course)
          triggerExport(answers, course)
      })
      console.log("Exports are being generated for " + courseData.length + " courses")
    } else {
      let data = await Promise.all( courses.map(async course => {
          attachmentData = await getUrls(answers, course)
          return {
            url: await attachmentData.url,
            name: await attachmentData.name,
            folder: course.name
          }
      }))
      const dl = new Downloader();
      dl.downloadFiles(data)
    }
    } catch (e) {
      console.error(e)
    }
  })