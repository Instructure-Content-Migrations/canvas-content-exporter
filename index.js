const axios = require('axios')
const csv = require('csvtojson')
const chalk = require('chalk')
const path = require('path')
const config = require('./config.js')
const inquirer = require('inquirer')
const fs = require('fs')
const ext = '.csv'

//TODO
//Polling?

const pConfig = {
  header: true
}

const fileList = fs.readdirSync("./", (err,files) => { return files })

const filteredList = fileList.filter(file => {
  return path.extname(file).toLowerCase() === ext
})

function triggerExport (answers,course) {
  return axios
  .post(`https://${answers.domain}.instructure.com/api/v1/courses/${course.canvas_course_id}/content_exports`,{
    headers: {
      "Authorization": `Bearer ${config.token}`
    }
  })
  .then(response => {
    return response
  })
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
      file.pipe(fs.createWriteStream(link.name))
  }
}

function getUrls () {
  //this function will be used to get all the most recent download URLs from a canvas course
  //make sure to build in handling for courses that don't have a recent export generated
  axios
      .get(`https://${answers.domain}.instructure.com/api/v1/courses/${course.canvas_course_id}/content_exports`,{
        headers: {
          "Authorization": `Bearer ${config.token}`
        }
      })
      .then(response => {
        console.log(response)
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
    const courses = await csv().fromFile(`./${answers.filePath}`)
    if (answers.choice === "Trigger exports") {
    const courseData = courses.map(async (course, index) => {
      try {
        triggerExport(course)
      } catch (e) {
        console.error(e)
      }
    })
  } else {
    const courseData = courses.map(async (course, index)  => {

      urlList

      try {
        const dl = new Downloader();
        dl.downloadFiles(urlList)
      }
    })
  }
  })