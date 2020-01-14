const axios = require('axios')
const { ConcurrencyManager } = require('axios-concurrency')
const csv = require('csvtojson')
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
      message: "Enter your Instructure password (This is never saved and only exists in memory)"
    }
  ])
  .then( async answers => {

    courses = csv().fromFile(`./${answers.filePath}`)
    (async function main(){
      const browser = await puppeteer.launch({
        // headless: false,
        // defaultViewport: null,
        // devtools: true
      })
      const page = await browser.newPage();

      let files = []

      for (let course of courses) {
        try {
          await page.goto(`https://${answers.domain}.instructure.com/courses/${course.canvas_course_id}/gradebook_csv?grading_period_id=null`)

          responseText = await page.evaluate(() => {
            text = document.querySelector("body").innerText
            return JSON.parse(text.replace('while(1);',''))
          })

          files.push(responseText)

        } catch (e) {
          console.error(e)
        }
      }

    })()
  }
  )