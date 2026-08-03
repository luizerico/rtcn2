const crypto = require('crypto');
const mongoose = require('mongoose');
const Survey = require('../models/assets/Survey');
const SurveyResponse = require('../models/assets/SurveyResponse');
const Question = require('../models/Question');
const { QUESTION_TYPES } = require('../constants/assetTypes');
// Ensure all asset discriminators are registered.
require('../models/assets');

function normalizeQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return { error: 'At least one question is required.' };
  }

  const questions = [];
  for (const [index, item] of rawQuestions.entries()) {
    const prompt = String(item?.prompt || '').trim();
    const type = String(item?.type || '').trim().toLowerCase();

    if (!prompt) {
      return { error: `Question ${index + 1} needs a prompt.` };
    }
    if (!QUESTION_TYPES.includes(type)) {
      return {
        error: `Question ${index + 1} type must be one of: ${QUESTION_TYPES.join(', ')}.`,
      };
    }

    let options = Array.isArray(item.options)
      ? item.options.map((opt) => String(opt).trim()).filter(Boolean)
      : [];

    if (type === 'multiple_choice' && options.length < 2) {
      return { error: `Question ${index + 1} (multiple choice) needs at least two options.` };
    }
    if (type === 'yes_no') {
      options = ['Yes', 'No'];
    }
    if (type === 'text') {
      options = [];
    }

    questions.push({
      questionId: item.questionId || crypto.randomUUID(),
      prompt,
      type,
      options,
      required: item.required !== false,
      sortOrder: index,
    });
  }

  return { questions };
}

async function loadSurveyQuestions(surveyId) {
  return Question.find({ surveyId }).sort({ sortOrder: 1, createdAt: 1 });
}

function serializeSurvey(survey, questions) {
  const plain = survey.toObject ? survey.toObject() : { ...survey };
  return {
    ...plain,
    questions: questions.map((q) => ({
      questionId: q.questionId,
      prompt: q.prompt,
      type: q.type,
      options: q.options,
      required: q.required,
      sortOrder: q.sortOrder,
    })),
  };
}

function validateAnswers(questions, answers) {
  if (!Array.isArray(answers) || answers.length === 0) {
    return { error: 'At least one answer is required.' };
  }

  const byId = new Map(questions.map((q) => [q.questionId, q]));
  const normalized = [];

  for (const question of questions) {
    const answer = answers.find((a) => a.questionId === question.questionId);
    if (!answer || answer.value === undefined || answer.value === null || answer.value === '') {
      if (question.required) {
        return { error: `Missing answer for: ${question.prompt}` };
      }
      continue;
    }

    const value = answer.value;

    if (question.type === 'text') {
      if (typeof value !== 'string') {
        return { error: `Answer for "${question.prompt}" must be text.` };
      }
      normalized.push({ questionId: question.questionId, value: value.trim() });
    } else if (question.type === 'yes_no') {
      const asBool =
        value === true ||
        value === false ||
        String(value).toLowerCase() === 'yes' ||
        String(value).toLowerCase() === 'no';
      if (!asBool) {
        return { error: `Answer for "${question.prompt}" must be Yes or No.` };
      }
      const yes = value === true || String(value).toLowerCase() === 'yes';
      normalized.push({ questionId: question.questionId, value: yes ? 'Yes' : 'No' });
    } else if (question.type === 'multiple_choice') {
      const choice = String(value);
      if (!question.options.includes(choice)) {
        return { error: `Answer for "${question.prompt}" must be one of the options.` };
      }
      normalized.push({ questionId: question.questionId, value: choice });
    }
  }

  for (const answer of answers) {
    if (!byId.has(answer.questionId)) {
      return { error: `Unknown question id: ${answer.questionId}` };
    }
  }

  return { answers: normalized };
}

function buildResponseSummary(survey, questions, responses) {
  const questionSummaries = questions.map((question) => {
    const counts = {};
    const textAnswers = [];

    if (question.type === 'multiple_choice' || question.type === 'yes_no') {
      for (const option of question.options) {
        counts[option] = 0;
      }
    }

    for (const response of responses) {
      const answer = response.answers.find((a) => a.questionId === question.questionId);
      if (!answer) continue;

      if (question.type === 'text') {
        textAnswers.push({
          responseId: response._id,
          respondent: response.createdBy,
          value: answer.value,
          submittedAt: response.createdAt,
        });
      } else {
        const key = String(answer.value);
        counts[key] = (counts[key] || 0) + 1;
      }
    }

    return {
      questionId: question.questionId,
      prompt: question.prompt,
      type: question.type,
      options: question.options,
      counts: question.type === 'text' ? undefined : counts,
      textAnswers: question.type === 'text' ? textAnswers : undefined,
      totalAnswered:
        question.type === 'text'
          ? textAnswers.length
          : Object.values(counts).reduce((sum, n) => sum + n, 0),
    };
  });

  return {
    surveyId: survey._id,
    surveyName: survey.name,
    responseCount: responses.length,
    questions: questionSummaries,
  };
}

async function replaceSurveyQuestions(surveyId, questions, userId) {
  await Question.deleteMany({ surveyId });
  if (!questions.length) return [];

  const docs = questions.map((q) => ({
    surveyId,
    questionId: q.questionId,
    prompt: q.prompt,
    type: q.type,
    options: q.options,
    required: q.required,
    sortOrder: q.sortOrder,
    createdBy: userId,
    updatedBy: userId,
  }));

  return Question.insertMany(docs);
}

const SORT_FIELDS = new Set(['name', 'createdAt', 'updatedAt', 'questionCount']);

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limitRaw = parseInt(String(query.limit || '10'), 10) || 10;
  const limit = Math.min(100, Math.max(1, limitRaw));
  const search = String(query.search || query.q || '').trim();
  const sortField = SORT_FIELDS.has(String(query.sort || ''))
    ? String(query.sort)
    : 'updatedAt';
  const order = String(query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const createdBy = String(query.createdBy || '').trim();

  return { page, limit, search, sortField, order, createdBy };
}

exports.listSurveys = async (req, res) => {
  try {
    const { page, limit, search, sortField, order, createdBy } = parseListQuery(req.query);
    const filter = {};

    const access = req.accessibleResources;
    if (access && !access.all) {
      if (!access.ids.length) {
        return res.status(200).json({
          items: [],
          page,
          limit,
          total: 0,
          totalPages: 0,
          sort: sortField,
          order,
          search,
          filters: { createdBy: createdBy || null },
        });
      }
      filter._id = { $in: access.ids };
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (createdBy) {
      if (!mongoose.isValidObjectId(createdBy)) {
        return res.status(400).json({ message: 'Invalid createdBy filter.' });
      }
      filter.createdBy = createdBy;
    }

    const total = await Survey.countDocuments(filter);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const surveys = await Survey.find(filter)
      .sort({ [sortField]: order === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .populate('ownerId', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    const items = surveys.map((survey) => {
      const plain = survey.toObject();
      return {
        ...plain,
        questionCount: plain.questionCount ?? 0,
      };
    });

    res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages,
      sort: sortField,
      order,
      search,
      filters: { createdBy: createdBy || null },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error listing surveys', error: error.message });
  }
};

exports.createSurvey = async (req, res) => {
  try {
    const { name, description, questions: rawQuestions } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Survey name is required.' });
    }

    const normalized = normalizeQuestions(rawQuestions);
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }

    const survey = await Survey.create({
      name: String(name).trim(),
      description: description || '',
      kind: 'SURVEY',
      questionCount: normalized.questions.length,
      ownerId: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const questions = await replaceSurveyQuestions(
      survey._id,
      normalized.questions,
      req.user._id
    );

    res.status(201).json(serializeSurvey(survey, questions));
  } catch (error) {
    res.status(500).json({ message: 'Error creating survey', error: error.message });
  }
};

exports.getSurveyById = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id)
      .populate('ownerId', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }

    const questions = await loadSurveyQuestions(survey._id);
    res.status(200).json(serializeSurvey(survey, questions));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching survey', error: error.message });
  }
};

exports.updateSurvey = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }

    if (req.body.name !== undefined) survey.name = String(req.body.name).trim();
    if (req.body.description !== undefined) survey.description = req.body.description;

    let questions = await loadSurveyQuestions(survey._id);
    if (req.body.questions !== undefined) {
      const normalized = normalizeQuestions(req.body.questions);
      if (normalized.error) {
        return res.status(400).json({ message: normalized.error });
      }
      questions = await replaceSurveyQuestions(survey._id, normalized.questions, req.user._id);
      survey.questionCount = questions.length;
    }

    survey.updatedBy = req.user._id;
    await survey.save();
    res.status(200).json(serializeSurvey(survey, questions));
  } catch (error) {
    res.status(500).json({ message: 'Error updating survey', error: error.message });
  }
};

exports.deleteSurvey = async (req, res) => {
  try {
    const survey = await Survey.findByIdAndDelete(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }
    await Question.deleteMany({ surveyId: survey._id });
    await SurveyResponse.deleteMany({ surveyId: survey._id });
    res.status(200).json({ message: 'Survey, questions, and related responses deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting survey', error: error.message });
  }
};

exports.submitSurveyResponse = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }

    const questions = await loadSurveyQuestions(survey._id);
    const validated = validateAnswers(questions, req.body.answers);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    const answerPreview = validated.answers
      .map((answer) => String(answer.value ?? '').trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    const respondentName = req.user.username || 'user';
    const response = await SurveyResponse.create({
      name: `${respondentName} · ${survey.name}`,
      description: answerPreview || `Submitted response for ${survey.name}`,
      kind: 'SURVEY_RESPONSE',
      surveyId: survey._id,
      answers: validated.answers,
      ownerId: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error submitting survey response', error: error.message });
  }
};

exports.listSurveyResponses = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }

    const questions = await loadSurveyQuestions(survey._id);
    const responses = await SurveyResponse.find({ surveyId: survey._id })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      survey: serializeSurvey(survey, questions),
      responses,
      summary: buildResponseSummary(survey, questions, responses),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error listing survey responses', error: error.message });
  }
};
